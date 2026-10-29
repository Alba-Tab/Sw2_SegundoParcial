package bo.transporte.viajes.dominio.viaje;

import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * La operación del servicio (spec 003). Nace en PROGRAMANDO en el paso 1 de la saga y recibe su {@link Asignacion} en el
 * pivote. Los cambios de estado pasan por {@link EstadoViaje#puedePasarA}; repetir el mismo cambio no es error (las
 * actividades de Temporal se reintentan) y devuelve false para no publicar dos veces.
 */
public final class Viaje {
    private final UUID viajeId;
    private final UUID servicioId;
    private final UUID clienteId;
    private final UUID cotizacionId;
    private final Instant creadoEn;
    private EstadoViaje estado;
    private Asignacion asignacion;
    private String motivo;
    private String detalle;

    private Viaje(
            UUID viajeId,
            UUID servicioId,
            UUID clienteId,
            UUID cotizacionId,
            Instant creadoEn,
            EstadoViaje estado,
            Asignacion asignacion,
            String motivo,
            String detalle) {
        this.viajeId = Objects.requireNonNull(viajeId);
        this.servicioId = Objects.requireNonNull(servicioId);
        this.clienteId = Objects.requireNonNull(clienteId);
        this.cotizacionId = Objects.requireNonNull(cotizacionId);
        this.creadoEn = Objects.requireNonNull(creadoEn);
        this.estado = Objects.requireNonNull(estado);
        this.asignacion = asignacion;
        this.motivo = motivo;
        this.detalle = detalle;
    }

    /** Paso 1 de la saga. */
    public static Viaje programar(Servicio s, Instant ahora) {
        return new Viaje(
                s.viajeId(),
                s.servicioId(),
                s.clienteId(),
                s.cotizacionId(),
                ahora,
                EstadoViaje.PROGRAMANDO,
                null,
                null,
                null);
    }

    public static Viaje reconstruir(
            UUID viajeId,
            UUID servicioId,
            UUID clienteId,
            UUID cotizacionId,
            Instant creadoEn,
            EstadoViaje estado,
            Asignacion asignacion,
            String motivo,
            String detalle) {
        return new Viaje(viajeId, servicioId, clienteId, cotizacionId, creadoEn, estado, asignacion, motivo, detalle);
    }

    /** Pivote (paso 4): CONFIRMADO con ruta, carga, monto, unidad y chofer. */
    public boolean confirmar(Asignacion a) {
        if (estado == EstadoViaje.CONFIRMADO) return false;
        pasarA(EstadoViaje.CONFIRMADO);
        this.asignacion = Objects.requireNonNull(a);
        return true;
    }

    /** Compensación del paso 1, o cierre de una intervención (spec 011), o cancelación del usuario (spec 004). */
    public boolean cancelar(String motivo, String detalle) {
        if (estado == EstadoViaje.CANCELADO) return false;
        pasarA(EstadoViaje.CANCELADO);
        this.motivo = Objects.requireNonNull(motivo);
        this.detalle = detalle;
        return true;
    }

    /** Una compensación se agotó (spec 011). */
    public boolean requerirIntervencion() {
        if (estado == EstadoViaje.REQUIERE_INTERVENCION) return false;
        pasarA(EstadoViaje.REQUIERE_INTERVENCION);
        return true;
    }

    private void pasarA(EstadoViaje destino) {
        if (!estado.puedePasarA(destino)) {
            throw new ErrorDeDominio(
                    "CONFLICTO_ESTADO",
                    "El viaje está en " + estado + " y no puede pasar a " + destino,
                    Map.of("estadoActual", estado.name()));
        }
        estado = destino;
    }

    public UUID viajeId() {
        return viajeId;
    }

    public UUID servicioId() {
        return servicioId;
    }

    public UUID clienteId() {
        return clienteId;
    }

    public UUID cotizacionId() {
        return cotizacionId;
    }

    public Instant creadoEn() {
        return creadoEn;
    }

    public EstadoViaje estado() {
        return estado;
    }

    public Asignacion asignacion() {
        return asignacion;
    }

    public String motivo() {
        return motivo;
    }

    public String detalle() {
        return detalle;
    }
}
