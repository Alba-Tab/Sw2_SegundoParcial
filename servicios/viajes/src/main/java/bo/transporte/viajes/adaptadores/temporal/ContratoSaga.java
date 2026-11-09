package bo.transporte.viajes.adaptadores.temporal;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Tipos de contratos/temporal/programar-viaje.schema.json. Los ejemplos de cada {@code $defs} se deserializan en estos
 * records en ContratoSagaTest (S15). Un campo null no viaja (conversor con NON_NULL): es el "opcional" del contrato.
 */
public final class ContratoSaga {
    private ContratoSaga() {}

    public record Monto(String monto, String moneda) {}

    public record Compensacion(Duration scheduleToClose, int maximoIntentos) {}

    public record ParametrosSaga(Duration esperaAprobacion, Compensacion compensacion) {}

    public record EntradaProgramarViaje(
            UUID servicioId,
            UUID viajeId,
            UUID clienteId,
            UUID cotizacionId,
            String canal,
            String creadoPor,
            ParametrosSaga parametrosSaga) {}

    public record ResultadoProgramarViaje(String resultado, UUID servicioId, UUID viajeId, String motivo) {}

    public record EstadoProgramarViaje(
            String etapa,
            List<String> pasosCompletados,
            Instant esperaAprobacionVenceEn,
            String motivo,
            List<String> compensacionesPendientes) {}

    public record SenalAprobacionCredito(boolean aprobado, String aprobadoPor, String motivo) {}

    public record SenalResolverIntervencion(String opcion, String resueltoPor, String nota) {}

    public record CrearViajeEntrada(UUID servicioId, UUID viajeId, UUID clienteId, UUID cotizacionId) {}

    public record ValidarYReservarCreditoEntrada(
            UUID servicioId, UUID clienteId, UUID cotizacionId, Duration esperaAprobacion) {}

    public record ValidarYReservarCreditoResultado(
            String resultado,
            UUID reservaCreditoId,
            UUID rutaId,
            String tipoCarga,
            BigDecimal toneladas,
            LocalDate fechaViaje,
            Monto monto,
            List<String> motivosAprobacion) {}

    public record RegistrarDecisionCreditoEntrada(
            UUID servicioId, String decision, String aprobadoPor, String motivo) {}

    public record ReservarUnidadEntrada(
            UUID servicioId, UUID viajeId, String tipoCarga, BigDecimal toneladas, LocalDate fechaViaje) {}

    public record ReservarUnidadResultado(
            UUID reservaUnidadId,
            UUID tractoId,
            UUID remolqueId,
            String placa,
            UUID choferId,
            String choferNombre,
            String choferUsuarioSub) {}

    public record ConfirmarViajeEntrada(
            UUID viajeId,
            UUID rutaId,
            String tipoCarga,
            BigDecimal toneladas,
            LocalDate fechaViaje,
            Monto monto,
            UUID reservaUnidadId,
            UUID tractoId,
            UUID remolqueId,
            String placa,
            UUID choferId,
            String choferNombre,
            String choferUsuarioSub) {}

    public record ConfirmarReservaEntrada(UUID reservaUnidadId, UUID servicioId) {}

    public record MarcarConfirmacionCompletaEntrada(UUID servicioId) {}

    public record LiberarReservaEntrada(UUID servicioId, UUID reservaUnidadId) {}

    public record LiberarCreditoEntrada(UUID servicioId, String motivo) {}

    public record CancelarViajeEntrada(UUID viajeId, String motivo, String detalle) {}

    public record MarcarRequiereIntervencionEntrada(
            UUID viajeId, UUID servicioId, String compensacionFallida, DetalleFallo error, int intentos) {}

    public record DetalleFallo(String codigo, String mensaje, Map<String, Object> datos) {}
}
