package poc.viajes;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** Tipos de contratos/temporal/programar-viaje.schema.json (solo los que usa la PoC). */
public final class Contrato {
  private Contrato() {}

  public record Monto(String monto, String moneda) {}

  public record Compensacion(Duration scheduleToClose, int maximoIntentos) {}

  public record ParametrosSaga(Duration esperaAprobacion, Compensacion compensacion) {}

  public record EntradaProgramarViaje(String servicioId, String viajeId, String clienteId, String cotizacionId,
      String canal, String creadoPor, ParametrosSaga parametrosSaga) {}

  public record ResultadoProgramarViaje(String resultado, String servicioId, String viajeId, String motivo) {}

  public record EstadoProgramarViaje(String etapa, List<String> pasosCompletados, Instant esperaAprobacionVenceEn,
      String motivo, List<String> compensacionesPendientes) {}

  public record CrearViajeEntrada(String servicioId, String viajeId, String clienteId, String cotizacionId) {}

  public record ValidarYReservarCreditoEntrada(String servicioId, String clienteId, String cotizacionId,
      Duration esperaAprobacion) {}

  public record ValidarYReservarCreditoResultado(String resultado, String reservaCreditoId, String rutaId,
      String tipoCarga, BigDecimal toneladas, LocalDate fechaViaje, Monto monto, List<String> motivosAprobacion) {}

  public record ReservarUnidadEntrada(String servicioId, String viajeId, String tipoCarga, BigDecimal toneladas,
      LocalDate fechaViaje) {}

  public record ReservarUnidadResultado(String reservaUnidadId, String tractoId, String remolqueId, String placa,
      String choferId, String choferNombre, String choferUsuarioSub) {}

  public record ConfirmarViajeEntrada(String viajeId, String rutaId, String tipoCarga, BigDecimal toneladas,
      LocalDate fechaViaje, Monto monto, String reservaUnidadId, String tractoId, String remolqueId, String placa,
      String choferId, String choferNombre, String choferUsuarioSub) {}

  public record ConfirmarReservaEntrada(String reservaUnidadId, String servicioId) {}

  public record MarcarConfirmacionCompletaEntrada(String servicioId) {}

  public record LiberarReservaEntrada(String servicioId, String reservaUnidadId) {}

  public record LiberarCreditoEntrada(String servicioId, String motivo) {}

  public record CancelarViajeEntrada(String viajeId, String motivo, String detalle) {}

  public record DetalleFallo(String codigo, String mensaje, Map<String, Object> datos) {}
}
