package bo.transporte.viajes.aplicacion.viaje;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.Auditoria;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroDeEventos;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente;
import bo.transporte.viajes.aplicacion.puerto.salida.ServicioRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.aplicacion.puerto.salida.ViajeRepositorio;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * POST /api/v1/viajes/{viajeId}/inicio (spec 005). En una transacción: la clave (el {@code opId} de la cola del
 * celular), CONFIRMADO → EN_RUTA, auditoría con canal APP_CHOFER y ViajeIniciado en el Outbox (Flota pasa tracto y
 * remolque a EN_VIAJE, D20). Mientras la saga no completa la confirmación, 409 CONFIRMACION_EN_CURSO y la app reintenta.
 */
public class InicioDeViaje {
    public static final String OPERACION = "INICIAR_VIAJE";
    private static final Duration DESFASE_DE_RELOJ = Duration.ofMinutes(2);

    public record Posicion(double lat, double lng) {}

    private final ViajeRepositorio viajes;
    private final ServicioRepositorio servicios;
    private final ConsultaDeViajes consulta;
    private final RegistroDeEventos eventos;
    private final RegistroIdempotente idempotencia;
    private final Auditoria auditoria;
    private final Transacciones tx;
    private final Clock reloj;

    public InicioDeViaje(
            ViajeRepositorio viajes,
            ServicioRepositorio servicios,
            ConsultaDeViajes consulta,
            RegistroDeEventos eventos,
            RegistroIdempotente idempotencia,
            Auditoria auditoria,
            Transacciones tx,
            Clock reloj) {
        this.viajes = viajes;
        this.servicios = servicios;
        this.consulta = consulta;
        this.eventos = eventos;
        this.idempotencia = idempotencia;
        this.auditoria = auditoria;
        this.tx = tx;
        this.reloj = reloj;
    }

    public ViajeVista ejecutar(
            Solicitante quien, UUID viajeId, Instant iniciadoEn, Posicion posicion, UUID clave, String hashCuerpo) {
        try {
            return tx.enTransaccion(() -> iniciar(quien, viajeId, iniciadoEn, posicion, clave, hashCuerpo));
        } catch (RegistroIdempotente.ClaveRepetida e) {
            return tx.enTransaccion(() -> guardada(clave, hashCuerpo));
        }
    }

    private ViajeVista iniciar(
            Solicitante quien, UUID viajeId, Instant iniciadoEn, Posicion posicion, UUID clave, String hashCuerpo) {
        if (idempotencia.buscar(clave).isPresent()) return guardada(clave, hashCuerpo);
        if (!quien.tiene("chofer")) throw new ErrorDeDominio("SIN_PERMISO", "Solo el chofer asignado inicia el viaje");
        var v = viajes.paraActualizar(viajeId)
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe el viaje"));
        if (!quien.sub().equals(v.choferUsuarioSub())) {
            throw new ErrorDeDominio("SIN_PERMISO", "El viaje es de otro chofer");
        }
        if (iniciadoEn.isAfter(reloj.instant().plus(DESFASE_DE_RELOJ))) {
            throw new ErrorDeDominio("VALIDACION", "iniciadoEn: está en el futuro", Map.of("campo", "iniciadoEn"));
        }
        if (v.estado() != EstadoViaje.CONFIRMADO) {
            throw new ErrorDeDominio("CONFLICTO_ESTADO", "El viaje está " + v.estado() + " y no se puede iniciar");
        }
        var servicio = servicios.porId(v.servicioId()).orElseThrow();
        if (!servicio.confirmacionCompleta()) {
            throw new ErrorDeDominio("CONFIRMACION_EN_CURSO", "La confirmación del servicio sigue en curso");
        }
        if (viajes.otroEnRuta(quien.sub(), viajeId)) {
            throw new ErrorDeDominio("CONFLICTO_ESTADO", "El chofer ya tiene otro viaje en ruta");
        }

        v.iniciar(iniciadoEn);
        viajes.actualizar(v);
        var a = v.asignacion();
        Map<String, Object> datos = new LinkedHashMap<>();
        datos.put("viajeId", v.viajeId().toString());
        datos.put("servicioId", v.servicioId().toString());
        datos.put("choferId", a.choferId().toString());
        datos.put("tractoId", a.tractoId().toString());
        datos.put("remolqueId", a.remolqueId().toString());
        datos.put("placa", a.placa());
        datos.put("iniciadoEn", iniciadoEn.toString());
        if (posicion != null) datos.put("posicion", Map.of("lat", posicion.lat(), "lng", posicion.lng()));
        eventos.registrar("ViajeIniciado", "viajes.viaje-iniciado.v1", datos);
        auditoria.registrar(
                quien, "APP_CHOFER", OPERACION, "Viaje", viajeId, Map.of("iniciadoEn", iniciadoEn.toString()));
        var vista = consulta.vista(v);
        idempotencia.guardarCompletada(clave, OPERACION, hashCuerpo, 200, vista);
        return vista;
    }

    private ViajeVista guardada(UUID clave, String hashCuerpo) {
        var op = idempotencia.buscar(clave).orElseThrow();
        if (!op.hashCuerpo().equals(hashCuerpo) || !OPERACION.equals(op.tipo())) {
            throw new ErrorDeDominio("IDEMPOTENCIA_CUERPO_DISTINTO", "La clave ya se usó con otro cuerpo");
        }
        return (ViajeVista) op.respuesta();
    }
}
