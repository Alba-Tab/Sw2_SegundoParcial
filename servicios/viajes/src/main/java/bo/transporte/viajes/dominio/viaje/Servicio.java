package bo.transporte.viajes.dominio.viaje;

import bo.transporte.viajes.dominio.comun.CanalServicio;
import bo.transporte.viajes.dominio.comun.Uuid7;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * El pedido del cliente (spec 003, D03): 1:1 con su Viaje. Viajes genera {@code servicioId} y {@code viajeId} antes de
 * iniciar la saga; {@code workflowId = programar-viaje-<servicioId>}. Desde {@code confirmacionCompleta} se puede
 * cancelar (spec 004).
 */
public record Servicio(
        UUID servicioId,
        UUID viajeId,
        UUID clienteId,
        UUID cotizacionId,
        CanalServicio canal,
        String creadoPor,
        boolean confirmacionCompleta,
        Instant creadoEn) {
    public Servicio {
        Objects.requireNonNull(servicioId);
        Objects.requireNonNull(viajeId);
        Objects.requireNonNull(clienteId);
        Objects.requireNonNull(cotizacionId);
        Objects.requireNonNull(canal);
        Objects.requireNonNull(creadoPor);
        Objects.requireNonNull(creadoEn);
    }

    public static Servicio nuevo(
            UUID clienteId, UUID cotizacionId, CanalServicio canal, String creadoPor, Instant ahora) {
        return new Servicio(Uuid7.nuevo(), Uuid7.nuevo(), clienteId, cotizacionId, canal, creadoPor, false, ahora);
    }

    public String workflowId() {
        return "programar-viaje-" + servicioId;
    }
}
