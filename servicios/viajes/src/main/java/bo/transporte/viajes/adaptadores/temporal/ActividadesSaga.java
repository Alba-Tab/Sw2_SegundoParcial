package bo.transporte.viajes.adaptadores.temporal;

import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.CancelarViajeEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ConfirmarReservaEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ConfirmarViajeEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.CrearViajeEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.LiberarCreditoEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.LiberarReservaEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.MarcarConfirmacionCompletaEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.MarcarRequiereIntervencionEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.RegistrarDecisionCreditoEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ReservarUnidadEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ReservarUnidadResultado;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ValidarYReservarCreditoEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ValidarYReservarCreditoResultado;
import io.temporal.activity.ActivityInterface;
import io.temporal.activity.ActivityMethod;

/** Actividades de la saga con los nombres explícitos del contrato (S14), iguales en Java, PHP y TypeScript. */
public final class ActividadesSaga {
    private ActividadesSaga() {}

    /** Cola viajes: las implementa {@link ActividadesViajes}. */
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

        @ActivityMethod(name = "Viajes.marcarRequiereIntervencion")
        void marcarRequiereIntervencion(MarcarRequiereIntervencionEntrada entrada);
    }

    /** Cola finanzas: worker PHP de Finanzas. */
    @ActivityInterface
    public interface Finanzas {
        @ActivityMethod(name = "Finanzas.validarYReservarCredito")
        ValidarYReservarCreditoResultado validarYReservarCredito(ValidarYReservarCreditoEntrada entrada);

        @ActivityMethod(name = "Finanzas.registrarDecisionCredito")
        void registrarDecisionCredito(RegistrarDecisionCreditoEntrada entrada);

        @ActivityMethod(name = "Finanzas.liberarCredito")
        void liberarCredito(LiberarCreditoEntrada entrada);
    }

    /** Cola flota: worker TypeScript de Flota. */
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
