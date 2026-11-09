package bo.transporte.viajes.aplicacion.viaje;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.BitacoraRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroDeEventos;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.aplicacion.puerto.salida.ViajeRepositorio;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.viaje.EventoConduccion;
import bo.transporte.viajes.dominio.viaje.Hito;
import bo.transporte.viajes.dominio.viaje.Viaje;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Hitos y eventos de conducción del chofer (spec 005, pasos 7 y 8). Cada uno con su clave en operacion_idempotente, en
 * la misma transacción que el registro y su evento en el Outbox (FO1: llegan una sola vez aunque la cola los reenvíe).
 */
public class BitacoraDeRuta {
    public static final String HITO = "REGISTRAR_HITO";
    public static final String EVENTO = "REGISTRAR_EVENTO_CONDUCCION";
    private static final Duration DESFASE_DE_RELOJ = Duration.ofMinutes(2);
    /** Contrato listarHitos: chofer propio, despachador, comercial, gerente y agente_lectura (sin jefe_flota). */
    private static final Set<String> LEEN_HITOS =
            Set.of("chofer", "despachador", "comercial", "gerente", "agente_lectura");

    private static final int HITOS_RECIENTES = 20;
    private static final int HITOS_BUSCADOS = 50;

    private final ViajeRepositorio viajes;
    private final ConsultaDeViajes consulta;
    private final BitacoraRepositorio bitacora;
    private final RegistroDeEventos eventos;
    private final RegistroIdempotente idempotencia;
    private final Transacciones tx;
    private final Clock reloj;

    public BitacoraDeRuta(
            ViajeRepositorio viajes,
            ConsultaDeViajes consulta,
            BitacoraRepositorio bitacora,
            RegistroDeEventos eventos,
            RegistroIdempotente idempotencia,
            Transacciones tx,
            Clock reloj) {
        this.viajes = viajes;
        this.consulta = consulta;
        this.bitacora = bitacora;
        this.eventos = eventos;
        this.idempotencia = idempotencia;
        this.tx = tx;
        this.reloj = reloj;
    }

    public Hito registrarHito(Solicitante quien, Hito h, UUID clave, String hash) {
        return idempotente(clave, HITO, hash, Hito.class, () -> {
            delChofer(quien, h.viajeId());
            noFuturo(h.registradoEn(), "registradoEn");
            if (!bitacora.insertarHito(h)) {
                throw new ErrorDeDominio("CONFLICTO_ESTADO", "Ese hitoId ya está registrado con otra clave");
            }
            Map<String, Object> datos = new LinkedHashMap<>();
            datos.put("viajeId", h.viajeId().toString());
            datos.put("hitoId", h.hitoId().toString());
            datos.put("tipo", h.tipo().name());
            datos.put("descripcion", h.descripcion());
            datos.put("posicion", Map.of("lat", h.lat(), "lng", h.lng()));
            datos.put("registradoEn", h.registradoEn().toString());
            eventos.registrar("HitoRegistrado", "viajes.hito-registrado.v1", datos);
            return h;
        });
    }

    public EventoConduccion registrarEvento(Solicitante quien, EventoConduccion e, UUID clave, String hash) {
        return idempotente(clave, EVENTO, hash, EventoConduccion.class, () -> {
            Viaje v = delChofer(quien, e.viajeId());
            noFuturo(e.registradoEn(), "registradoEn");
            if (!bitacora.insertarEvento(e)) {
                throw new ErrorDeDominio("CONFLICTO_ESTADO", "Ese eventoId ya está registrado con otra clave");
            }
            Map<String, Object> datos = new LinkedHashMap<>();
            datos.put("eventoId", e.eventoId().toString());
            datos.put("viajeId", e.viajeId().toString());
            datos.put("choferId", v.asignacion().choferId().toString());
            datos.put("tipo", e.tipo().name());
            if (e.magnitudG() != null) datos.put("magnitudG", e.magnitudG());
            datos.put("posicion", Map.of("lat", e.lat(), "lng", e.lng()));
            datos.put("registradoEn", e.registradoEn().toString());
            eventos.registrar("EventoConduccionRegistrado", "viajes.evento-conduccion-registrado.v1", datos);
            return e;
        });
    }

    /** GET /viajes/{id}/hitos: sin texto, los 20 más nuevos; con texto, los que lo contienen (spec 014). */
    public List<Hito> hitos(Solicitante quien, UUID viajeId, String texto) {
        if (!quien.tieneAlguno(LEEN_HITOS)) {
            throw new ErrorDeDominio("SIN_PERMISO", "Tu rol no lee la bitácora");
        }
        consulta.legible(quien, viajeId);
        boolean busca = texto != null && !texto.isBlank();
        return bitacora.hitos(viajeId, busca ? texto.strip() : null, busca ? HITOS_BUSCADOS : HITOS_RECIENTES);
    }

    private Viaje delChofer(Solicitante quien, UUID viajeId) {
        if (!quien.tiene("chofer")) throw new ErrorDeDominio("SIN_PERMISO", "Solo el chofer registra su bitácora");
        Viaje v = viajes.porId(viajeId)
                .filter(x -> x.asignacion() != null)
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe el viaje"));
        if (!quien.sub().equals(v.choferUsuarioSub())) {
            throw new ErrorDeDominio("SIN_PERMISO", "El viaje es de otro chofer");
        }
        if (!v.estado().aceptaRegistrosDeRuta()) {
            throw new ErrorDeDominio(
                    "CONFLICTO_ESTADO", "El viaje está " + v.estado() + " y no recibe registros de ruta");
        }
        return v;
    }

    private void noFuturo(Instant instante, String campo) {
        if (instante.isAfter(reloj.instant().plus(DESFASE_DE_RELOJ))) {
            throw new ErrorDeDominio("VALIDACION", campo + ": está en el futuro", Map.of("campo", campo));
        }
    }

    private <T> T idempotente(UUID clave, String operacion, String hash, Class<T> tipo, Supplier<T> hacer) {
        Supplier<T> guardada = () -> {
            var op = idempotencia.buscar(clave).orElseThrow();
            if (!op.hashCuerpo().equals(hash) || !operacion.equals(op.tipo())) {
                throw new ErrorDeDominio("IDEMPOTENCIA_CUERPO_DISTINTO", "La clave ya se usó con otro cuerpo");
            }
            return tipo.cast(op.respuesta());
        };
        try {
            return tx.enTransaccion(() -> {
                if (idempotencia.buscar(clave).isPresent()) return guardada.get();
                T r = hacer.get();
                idempotencia.guardarCompletada(clave, operacion, hash, 200, r);
                return r;
            });
        } catch (RegistroIdempotente.ClaveRepetida e) {
            return tx.enTransaccion(guardada);
        }
    }
}
