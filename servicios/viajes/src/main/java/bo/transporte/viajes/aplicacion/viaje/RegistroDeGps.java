package bo.transporte.viajes.aplicacion.viaje;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.AlmacenGps;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroDeEventos;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.aplicacion.puerto.salida.UltimaPosicionRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.UltimaPosicionRepositorio.UltimaPosicion;
import bo.transporte.viajes.aplicacion.puerto.salida.ViajeRepositorio;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import bo.transporte.viajes.dominio.viaje.PuntoGps;
import bo.transporte.viajes.dominio.viaje.Viaje;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * POST /viajes/{viajeId}/gps/lotes (spec 005, pasos 5 y 6). Los puntos van a DynamoDB (la llave {@code ts#seq} es la
 * autoridad de idempotencia, excepción de 000 §4.1). Después, en una transacción, la última posición avanza solo si el
 * lote trae un punto más nuevo y el viaje está EN_RUTA, con un PosicionActualizada por lote (D19): un reenvío no avanza
 * nada y no repite el evento. Al final, el cursor del dispositivo; si falla, la respuesta del lote ya lo dice.
 */
public class RegistroDeGps {
    private static final System.Logger LOG = System.getLogger(RegistroDeGps.class.getName());

    public record Resultado(int aceptados, long ultimaSecuencia, boolean ultimaPosicionActualizada) {}

    private final ViajeRepositorio viajes;
    private final AlmacenGps almacen;
    private final UltimaPosicionRepositorio posiciones;
    private final RegistroDeEventos eventos;
    private final Transacciones tx;
    private final Clock reloj;

    public RegistroDeGps(
            ViajeRepositorio viajes,
            AlmacenGps almacen,
            UltimaPosicionRepositorio posiciones,
            RegistroDeEventos eventos,
            Transacciones tx,
            Clock reloj) {
        this.viajes = viajes;
        this.almacen = almacen;
        this.posiciones = posiciones;
        this.eventos = eventos;
        this.tx = tx;
        this.reloj = reloj;
    }

    public Resultado registrar(Solicitante quien, UUID viajeId, UUID dispositivoId, List<PuntoGps> puntos) {
        Viaje v = delChofer(quien, viajeId);
        if (!v.estado().aceptaRegistrosDeRuta()) {
            throw new ErrorDeDominio("CONFLICTO_ESTADO", "El viaje está " + v.estado() + " y no recibe GPS");
        }
        PuntoGps.validarLote(puntos, v.iniciadoEn(), reloj.instant());
        try {
            almacen.escribir(viajeId, dispositivoId, puntos);
        } catch (AlmacenGps.SinCapacidad e) {
            throw new ErrorDeDominio(
                    "DEPENDENCIA_NO_DISPONIBLE", "El almacén de GPS está saturado; reintenta más tarde");
        }
        PuntoGps nuevo = PuntoGps.masNuevo(puntos);
        boolean avanzo = tx.enTransaccion(() -> avanzar(viajeId, dispositivoId, nuevo, puntos.size()));
        long ultimaSecuencia = puntos.stream().mapToLong(PuntoGps::seq).max().orElseThrow();
        try {
            almacen.avanzarCursor(dispositivoId, viajeId, ultimaSecuencia);
        } catch (RuntimeException e) {
            LOG.log(System.Logger.Level.WARNING, "No se pudo avanzar el cursor de " + dispositivoId, e);
        }
        return new Resultado(puntos.size(), ultimaSecuencia, avanzo);
    }

    private boolean avanzar(UUID viajeId, UUID dispositivoId, PuntoGps p, int puntosEnLote) {
        // Se relee dentro de la transacción: solo un viaje EN_RUTA mueve el mapa (los puntos tardíos no).
        Viaje v = viajes.paraActualizar(viajeId).orElseThrow();
        if (v.estado() != EstadoViaje.EN_RUTA) return false;
        var posicion = new UltimaPosicion(p.lat(), p.lng(), p.velocidadKmh(), p.registradaEn());
        if (!posiciones.avanzar(viajeId, dispositivoId, posicion)) return false;
        Map<String, Object> datos = new LinkedHashMap<>();
        datos.put("viajeId", viajeId.toString());
        datos.put("choferId", v.asignacion().choferId().toString());
        datos.put("posicion", Map.of("lat", p.lat(), "lng", p.lng()));
        datos.put("velocidadKmh", p.velocidadKmh());
        datos.put("registradaEn", p.registradaEn().toString());
        datos.put("puntosEnLote", puntosEnLote);
        eventos.registrar("PosicionActualizada", "viajes.posicion-actualizada.v1", datos);
        return true;
    }

    private Viaje delChofer(Solicitante quien, UUID viajeId) {
        if (!quien.tiene("chofer")) throw new ErrorDeDominio("SIN_PERMISO", "Solo el chofer envía su GPS");
        Viaje v = viajes.porId(viajeId)
                .filter(x -> x.asignacion() != null)
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe el viaje"));
        if (!quien.sub().equals(v.choferUsuarioSub())) {
            throw new ErrorDeDominio("SIN_PERMISO", "El viaje es de otro chofer");
        }
        return v;
    }
}
