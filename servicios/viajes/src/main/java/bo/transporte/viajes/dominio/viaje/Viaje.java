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
    private Instant iniciadoEn;
    private Instant entregadoEn;
    private UUID facturaId;
    private String numeroFactura;

    private Viaje(
            UUID viajeId,
            UUID servicioId,
            UUID clienteId,
            UUID cotizacionId,
            Instant creadoEn,
            EstadoViaje estado,
            Asignacion asignacion,
            String motivo,
            String detalle,
            Instant iniciadoEn) {
        this.viajeId = Objects.requireNonNull(viajeId);
        this.servicioId = Objects.requireNonNull(servicioId);
        this.clienteId = Objects.requireNonNull(clienteId);
        this.cotizacionId = Objects.requireNonNull(cotizacionId);
        this.creadoEn = Objects.requireNonNull(creadoEn);
        this.estado = Objects.requireNonNull(estado);
        this.asignacion = asignacion;
        this.motivo = motivo;
        this.detalle = detalle;
        this.iniciadoEn = iniciadoEn;
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
            String detalle,
            Instant iniciadoEn) {
        return new Viaje(
                viajeId,
                servicioId,
                clienteId,
                cotizacionId,
                creadoEn,
                estado,
                asignacion,
                motivo,
                detalle,
                iniciadoEn);
    }

    /** Spec 005: el chofer registra el inicio; CONFIRMADO → EN_RUTA con la hora del celular. */
    public void iniciar(Instant iniciadoEn) {
        pasarA(EstadoViaje.EN_RUTA);
        this.iniciadoEn = Objects.requireNonNull(iniciadoEn);
    }

    /** Lo que el viaje acumula desde la entrega (specs 006 y 007); solo lo usa el repositorio al leer. */
    public Viaje conEntrega(Instant entregadoEn, UUID facturaId, String numeroFactura) {
        this.entregadoEn = entregadoEn;
        this.facturaId = facturaId;
        this.numeroFactura = numeroFactura;
        return this;
    }

    /** Spec 006: dentro de la geocerca y con firma queda ENTREGADO; si no, ENTREGA_OBSERVADA (spec 007). */
    public void entregar(Instant entregadoEn, boolean observada) {
        pasarA(observada ? EstadoViaje.ENTREGA_OBSERVADA : EstadoViaje.ENTREGADO);
        this.entregadoEn = Objects.requireNonNull(entregadoEn);
    }

    /** Spec 007: el despachador aprueba la entrega observada. */
    public void aprobarEntrega() {
        if (estado != EstadoViaje.ENTREGA_OBSERVADA) {
            throw new ErrorDeDominio("CONFLICTO_ESTADO", "El viaje está " + estado + "; no hay entrega por revisar");
        }
        pasarA(EstadoViaje.ENTREGADO);
    }

    /** Spec 007: rechaza el receptor (desde EN_RUTA) o el despachador (desde ENTREGA_OBSERVADA). */
    public void rechazarEntrega(EstadoViaje desde) {
        if (estado != desde) {
            throw new ErrorDeDominio("CONFLICTO_ESTADO", "El viaje está " + estado + " y no se puede rechazar así");
        }
        pasarA(EstadoViaje.ENTREGA_RECHAZADA);
    }

    /** Spec 006, paso 9: llega FacturaEmitida. false si ya estaba cerrado (evento repetido). */
    public boolean cerrar(UUID facturaId, String numeroFactura) {
        if (estado == EstadoViaje.CERRADO) return false;
        pasarA(EstadoViaje.CERRADO);
        this.facturaId = Objects.requireNonNull(facturaId);
        this.numeroFactura = Objects.requireNonNull(numeroFactura);
        return true;
    }

    /** El chofer asignado en el pivote; null antes de confirmar. */
    public String choferUsuarioSub() {
        return asignacion == null ? null : asignacion.choferUsuarioSub();
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

    public Instant iniciadoEn() {
        return iniciadoEn;
    }

    public Instant entregadoEn() {
        return entregadoEn;
    }

    public UUID facturaId() {
        return facturaId;
    }

    public String numeroFactura() {
        return numeroFactura;
    }
}
