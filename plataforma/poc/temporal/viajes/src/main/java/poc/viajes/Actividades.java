package poc.viajes;

import io.temporal.activity.ActivityInterface;
import io.temporal.activity.ActivityMethod;
import poc.viajes.Contrato.*;

/** Interfaces de actividades con nombres explícitos (contrato §Actividades). */
public final class Actividades {
  private Actividades() {}

  @ActivityInterface
  public interface Viajes {
    @ActivityMethod(name = "Viajes.crearViaje")
    void crearViaje(CrearViajeEntrada entrada);

    @ActivityMethod(name = "Viajes.confirmarViaje")
    void confirmarViaje(ConfirmarViajeEntrada entrada);

    @ActivityMethod(name = "Viajes.marcarConfirmacionCompleta")
    void marcarConfirmacionCompleta(MarcarConfirmacionCompletaEntrada entrada);

    @ActivityMethod(name = "Viajes.cancelarViaje")
    void cancelarViaje(CancelarViajeEntrada entrada);
  }

  /** Implementada en PHP (cola finanzas). */
  @ActivityInterface
  public interface Finanzas {
    @ActivityMethod(name = "Finanzas.validarYReservarCredito")
    ValidarYReservarCreditoResultado validarYReservarCredito(ValidarYReservarCreditoEntrada entrada);

    @ActivityMethod(name = "Finanzas.liberarCredito")
    void liberarCredito(LiberarCreditoEntrada entrada);
  }

  /** Implementada en TypeScript (cola flota). */
  @ActivityInterface
  public interface Flota {
    @ActivityMethod(name = "Flota.reservarUnidad")
    ReservarUnidadResultado reservarUnidad(ReservarUnidadEntrada entrada);

    @ActivityMethod(name = "Flota.confirmarReserva")
    void confirmarReserva(ConfirmarReservaEntrada entrada);

    @ActivityMethod(name = "Flota.liberarReserva")
    void liberarReserva(LiberarReservaEntrada entrada);
  }
}
