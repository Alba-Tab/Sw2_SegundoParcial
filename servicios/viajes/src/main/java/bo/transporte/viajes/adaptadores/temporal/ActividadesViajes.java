package bo.transporte.viajes.adaptadores.temporal;

import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.CancelarViajeEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ConfirmarViajeEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.CrearViajeEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.DetalleFallo;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.MarcarConfirmacionCompletaEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.MarcarRequiereIntervencionEntrada;
import bo.transporte.viajes.aplicacion.viaje.ProgramacionDeViaje;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.comun.Monto;
import bo.transporte.viajes.dominio.comun.TipoCarga;
import bo.transporte.viajes.dominio.viaje.Asignacion;
import io.temporal.failure.ApplicationFailure;
import java.math.BigDecimal;
import org.springframework.stereotype.Component;

/**
 * Actividades Viajes.* (cola viajes): traducen el contrato a los casos de uso. VALIDACION sale como error no
 * reintentable con su DetalleFallo; cualquier otro error es técnico y Temporal lo reintenta según D15.
 */
@Component
class ActividadesViajes implements ActividadesSaga.Viajes {
    private final ProgramacionDeViaje programacion;

    ActividadesViajes(ProgramacionDeViaje programacion) {
        this.programacion = programacion;
    }

    @Override
    public void crearViaje(CrearViajeEntrada e) {
        traducir(() -> programacion.crearViaje(e.servicioId(), e.viajeId()));
    }

    @Override
    public void confirmarViaje(ConfirmarViajeEntrada e) {
        var asignacion = new Asignacion(
                e.rutaId(),
                TipoCarga.valueOf(e.tipoCarga()),
                e.toneladas(),
                e.fechaViaje(),
                new Monto(new BigDecimal(e.monto().monto()), e.monto().moneda()),
                e.reservaUnidadId(),
                e.tractoId(),
                e.remolqueId(),
                e.placa(),
                e.choferId(),
                e.choferNombre(),
                e.choferUsuarioSub());
        traducir(() -> programacion.confirmarViaje(e.viajeId(), asignacion));
    }

    @Override
    public void marcarConfirmacionCompleta(MarcarConfirmacionCompletaEntrada e) {
        traducir(() -> programacion.marcarConfirmacionCompleta(e.servicioId()));
    }

    @Override
    public void cancelarViaje(CancelarViajeEntrada e) {
        traducir(() -> programacion.cancelarViaje(e.viajeId(), e.motivo(), e.detalle()));
    }

    @Override
    public void marcarRequiereIntervencion(MarcarRequiereIntervencionEntrada e) {
        traducir(() -> programacion.marcarRequiereIntervencion(
                e.viajeId(),
                e.servicioId(),
                e.compensacionFallida(),
                e.error().codigo(),
                e.error().mensaje(),
                e.intentos()));
    }

    private static void traducir(Runnable actividad) {
        try {
            actividad.run();
        } catch (ErrorDeDominio e) {
            if (!"VALIDACION".equals(e.codigo())) throw e;
            throw ApplicationFailure.newNonRetryableFailure(
                    e.getMessage(), e.codigo(), new DetalleFallo(e.codigo(), e.getMessage(), null));
        }
    }
}
