package bo.transporte.viajes.aplicacion.viaje;

import bo.transporte.viajes.aplicacion.puerto.salida.RegistroDeEventos;
import bo.transporte.viajes.aplicacion.puerto.salida.ServicioRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.aplicacion.puerto.salida.ViajeRepositorio;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.viaje.Asignacion;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import bo.transporte.viajes.dominio.viaje.Servicio;
import bo.transporte.viajes.dominio.viaje.Viaje;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Las actividades Viajes.* de la saga ProgramarViaje (contratos/temporal/programar-viaje.md). Cada una es idempotente:
 * un reintento con el mismo id no duplica el viaje ni vuelve a publicar su evento.
 */
public class ProgramacionDeViaje {
    private final ServicioRepositorio servicios;
    private final ViajeRepositorio viajes;
    private final RegistroDeEventos eventos;
    private final Transacciones tx;
    private final Clock reloj;

    public ProgramacionDeViaje(
            ServicioRepositorio servicios,
            ViajeRepositorio viajes,
            RegistroDeEventos eventos,
            Transacciones tx,
            Clock reloj) {
        this.servicios = servicios;
        this.viajes = viajes;
        this.eventos = eventos;
        this.tx = tx;
        this.reloj = reloj;
    }

    /** Paso 1: el viaje en PROGRAMANDO. */
    public void crearViaje(UUID servicioId, UUID viajeId) {
        tx.enTransaccion(
                () -> viajes.insertarSiNoExiste(Viaje.programar(servicio(servicioId, viajeId), reloj.instant())));
    }

    /** Paso 4, el pivote: CONFIRMADO con su asignación y ViajeConfirmado por Outbox. */
    public void confirmarViaje(UUID viajeId, Asignacion asignacion) {
        tx.enTransaccion(() -> {
            Viaje v = viaje(viajeId);
            if (!v.confirmar(asignacion)) return null;
            viajes.actualizar(v);
            Servicio s = servicios.porId(v.servicioId()).orElseThrow();
            eventos.registrar("ViajeConfirmado", "viajes.viaje-confirmado.v1", confirmado(v, s));
            return null;
        });
    }

    /** Paso 6: desde aquí el servicio se puede cancelar (spec 004). */
    public void marcarConfirmacionCompleta(UUID servicioId) {
        tx.enTransaccion(() -> {
            servicios.marcarConfirmacionCompleta(servicioId);
            return null;
        });
    }

    /**
     * Compensación del paso 1 (o cierre de una intervención): CANCELADO y ViajeCancelado con origen SAGA (D18). Si el
     * paso 1 nunca llegó a crear el viaje, se crea ya cancelado para que el servicio no quede en PROGRAMANDO.
     */
    public void cancelarViaje(UUID viajeId, String motivo, String detalleCompleto) {
        // El detalle de un fallo técnico puede traer un mensaje largo (SQL incluido): la columna y el contrato admiten
        // 600.
        String detalle = detalleCompleto == null || detalleCompleto.length() <= 600
                ? detalleCompleto
                : detalleCompleto.substring(0, 600);
        tx.enTransaccion(() -> {
            Viaje v = viajes.paraActualizar(viajeId).orElse(null);
            if (v == null) {
                Servicio s = servicios
                        .porViajeId(viajeId)
                        .orElseThrow(() -> new ErrorDeDominio("VALIDACION", "No existe un servicio con ese viajeId"));
                v = Viaje.programar(s, reloj.instant());
                viajes.insertarSiNoExiste(v);
            }
            EstadoViaje anterior = v.estado();
            if (!v.cancelar(motivo, detalle)) return null;
            viajes.actualizar(v);
            eventos.registrar(
                    "ViajeCancelado", "viajes.viaje-cancelado.v1", EventosDeViaje.cancelado(v, anterior, "SAGA", null));
            return null;
        });
    }

    /** Una compensación se agotó (spec 011): REQUIERE_INTERVENCION y ViajeRequiereIntervencion. */
    public void marcarRequiereIntervencion(
            UUID viajeId, UUID servicioId, String compensacionFallida, String codigo, String mensaje, int intentos) {
        tx.enTransaccion(() -> {
            Viaje v = viajes.paraActualizar(viajeId).orElse(null);
            if (v == null) {
                v = Viaje.programar(servicio(servicioId, viajeId), reloj.instant());
                viajes.insertarSiNoExiste(v);
            }
            // Una ronda nueva de "reintentar compensación" que vuelve a agotarse publica otra vez el evento (spec 011:
            // "regresa al paso 1"); el estado ya era REQUIERE_INTERVENCION. Un viaje en otro estado final no cambia.
            boolean cambio = v.requerirIntervencion();
            if (!cambio && v.estado() != EstadoViaje.REQUIERE_INTERVENCION) return null;
            if (cambio) viajes.actualizar(v);
            String corto = mensaje == null ? "" : mensaje.length() > 500 ? mensaje.substring(0, 500) : mensaje;
            eventos.registrar(
                    "ViajeRequiereIntervencion",
                    "viajes.viaje-requiere-intervencion.v1",
                    Map.of(
                            "viajeId", viajeId.toString(),
                            "servicioId", servicioId.toString(),
                            "compensacionFallida", compensacionFallida,
                            "error", Map.of("codigo", codigo, "mensaje", corto),
                            "intentos", intentos));
            return null;
        });
    }

    private Servicio servicio(UUID servicioId, UUID viajeId) {
        return servicios
                .porId(servicioId)
                .filter(s -> s.viajeId().equals(viajeId))
                .orElseThrow(() -> new ErrorDeDominio("VALIDACION", "El servicio no existe o no es de ese viaje"));
    }

    private Viaje viaje(UUID viajeId) {
        return viajes.paraActualizar(viajeId)
                .orElseThrow(() -> new ErrorDeDominio("VALIDACION", "No existe el viaje " + viajeId));
    }

    /** contratos/eventos/viajes/ViajeConfirmado.v1.schema.json#/properties/datos */
    static Map<String, Object> confirmado(Viaje v, Servicio s) {
        var a = v.asignacion();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("viajeId", v.viajeId().toString());
        m.put("servicioId", s.servicioId().toString());
        m.put("clienteId", s.clienteId().toString());
        m.put("rutaId", a.rutaId().toString());
        m.put("tipoCarga", a.tipoCarga().name());
        m.put("toneladas", a.toneladas());
        m.put("fechaViaje", a.fechaViaje().toString());
        m.put(
                "monto",
                Map.of("monto", a.monto().comoTexto(), "moneda", a.monto().moneda()));
        m.put("canal", s.canal().name());
        m.put("placa", a.placa());
        m.put("tractoId", a.tractoId().toString());
        m.put("remolqueId", a.remolqueId().toString());
        m.put("choferId", a.choferId().toString());
        m.put("choferNombre", a.choferNombre());
        m.put("choferUsuarioSub", a.choferUsuarioSub());
        return m;
    }
}
