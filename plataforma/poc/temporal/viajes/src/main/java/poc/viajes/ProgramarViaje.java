package poc.viajes;

import io.temporal.activity.ActivityOptions;
import io.temporal.common.RetryOptions;
import io.temporal.failure.ActivityFailure;
import io.temporal.failure.ApplicationFailure;
import io.temporal.workflow.QueryMethod;
import io.temporal.workflow.Workflow;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import poc.viajes.Contrato.*;

/** Saga ProgramarViaje reducida a lo que prueba la PoC-2: pasos 1, 2, 3, pivote, 5, 6 y compensaciones (sin 2b ni intervención). */
@WorkflowInterface
public interface ProgramarViaje {
  @WorkflowMethod(name = "ProgramarViaje")
  ResultadoProgramarViaje ejecutar(EntradaProgramarViaje entrada);

  @QueryMethod(name = "estado")
  EstadoProgramarViaje estado();

  class Impl implements ProgramarViaje {
    private static final Logger LOG = Workflow.getLogger(Impl.class);
    private static final RetryOptions.Builder REINTENTO = RetryOptions.newBuilder()
        .setInitialInterval(Duration.ofSeconds(1)).setBackoffCoefficient(2).setMaximumInterval(Duration.ofSeconds(30));

    private String etapa = "INICIANDO";
    private final List<String> pasos = new ArrayList<>();
    private String motivo;

    private static ActivityOptions opciones(String cola, int startToClose, Duration scheduleToClose, String... noReintentables) {
      var b = ActivityOptions.newBuilder().setTaskQueue(cola).setStartToCloseTimeout(Duration.ofSeconds(startToClose))
          .setRetryOptions(RetryOptions.newBuilder(REINTENTO.build()).setDoNotRetry(noReintentables).build());
      if (scheduleToClose != null) b.setScheduleToCloseTimeout(scheduleToClose);
      return b.build();
    }

    @Override
    public ResultadoProgramarViaje ejecutar(EntradaProgramarViaje e) {
      var comp = e.parametrosSaga().compensacion();
      var viajes = Workflow.newActivityStub(Actividades.Viajes.class, opciones("viajes", 10, Duration.ofMinutes(5), "VALIDACION"));
      var viajesSinLimite = Workflow.newActivityStub(Actividades.Viajes.class, opciones("viajes", 10, null));
      var finanzas = Workflow.newActivityStub(Actividades.Finanzas.class,
          opciones("finanzas", 15, Duration.ofMinutes(30), "COTIZACION_VENCIDA", "COTIZACION_AJENA", "CREDITO_INSUFICIENTE"));
      var flota = Workflow.newActivityStub(Actividades.Flota.class, opciones("flota", 15, Duration.ofMinutes(30), "SIN_UNIDAD_COMPATIBLE"));
      var flotaSinLimite = Workflow.newActivityStub(Actividades.Flota.class, ActivityOptions.newBuilder(opciones("flota", 15, null))
          .setRetryOptions(RetryOptions.newBuilder(REINTENTO.build()).setMaximumInterval(Duration.ofMinutes(1)).build()).build());
      var compOpciones = ActivityOptions.newBuilder().setStartToCloseTimeout(Duration.ofSeconds(15))
          .setScheduleToCloseTimeout(comp.scheduleToClose())
          .setRetryOptions(RetryOptions.newBuilder(REINTENTO.build()).setMaximumAttempts(comp.maximoIntentos()).build());
      var finanzasComp = Workflow.newActivityStub(Actividades.Finanzas.class, ActivityOptions.newBuilder(compOpciones.build()).setTaskQueue("finanzas").build());
      var viajesComp = Workflow.newActivityStub(Actividades.Viajes.class, ActivityOptions.newBuilder(compOpciones.build()).setTaskQueue("viajes").build());

      ValidarYReservarCreditoResultado credito;
      ReservarUnidadResultado unidad;
      try {
        viajes.crearViaje(new CrearViajeEntrada(e.servicioId(), e.viajeId(), e.clienteId(), e.cotizacionId()));
        pasos.add("CREAR_VIAJE");
        etapa = "VALIDANDO_CREDITO";
        credito = finanzas.validarYReservarCredito(
            new ValidarYReservarCreditoEntrada(e.servicioId(), e.clienteId(), e.cotizacionId(), e.parametrosSaga().esperaAprobacion()));
        pasos.add("RESERVAR_CREDITO");
        etapa = "RESERVANDO_UNIDAD";
        unidad = flota.reservarUnidad(
            new ReservarUnidadEntrada(e.servicioId(), e.viajeId(), credito.tipoCarga(), credito.toneladas(), credito.fechaViaje()));
        pasos.add("RESERVAR_UNIDAD");
      } catch (ActivityFailure f) {
        DetalleFallo detalle = detalle(f);
        motivo = detalle.codigo();
        LOG.info("Fallo de negocio {}: {}", detalle.codigo(), detalle.mensaje());
        etapa = "COMPENSANDO";
        // Orden inverso. El paso 3 es el último antes del pivote: si falla no hay reserva que liberar.
        if (pasos.contains("RESERVAR_CREDITO")) finanzasComp.liberarCredito(new LiberarCreditoEntrada(e.servicioId(), motivo));
        if (pasos.contains("CREAR_VIAJE")) viajesComp.cancelarViaje(new CancelarViajeEntrada(e.viajeId(), motivo, detalle.mensaje()));
        etapa = "TERMINADO";
        return new ResultadoProgramarViaje("CANCELADO", e.servicioId(), e.viajeId(), motivo);
      }

      etapa = "CONFIRMANDO";
      viajesSinLimite.confirmarViaje(new ConfirmarViajeEntrada(e.viajeId(), credito.rutaId(), credito.tipoCarga(), credito.toneladas(),
          credito.fechaViaje(), credito.monto(), unidad.reservaUnidadId(), unidad.tractoId(), unidad.remolqueId(), unidad.placa(),
          unidad.choferId(), unidad.choferNombre(), unidad.choferUsuarioSub()));
      pasos.add("CONFIRMAR_VIAJE");
      flotaSinLimite.confirmarReserva(new ConfirmarReservaEntrada(unidad.reservaUnidadId(), e.servicioId()));
      pasos.add("CONFIRMAR_RESERVA");
      viajesSinLimite.marcarConfirmacionCompleta(new MarcarConfirmacionCompletaEntrada(e.servicioId()));
      pasos.add("CONFIRMACION_COMPLETA");
      etapa = "TERMINADO";
      return new ResultadoProgramarViaje("CONFIRMADO", e.servicioId(), e.viajeId(), null);
    }

    /** El error de negocio llega como ApplicationFailure con type = código y details = DetalleFallo, venga de PHP o de TS. */
    private static DetalleFallo detalle(ActivityFailure f) {
      if (f.getCause() instanceof ApplicationFailure af && af.isNonRetryable()) {
        try {
          return af.getDetails().get(DetalleFallo.class);
        } catch (RuntimeException ex) {
          return new DetalleFallo(af.getType(), af.getOriginalMessage(), null);
        }
      }
      return new DetalleFallo("DEPENDENCIA_NO_DISPONIBLE", String.valueOf(f.getCause()), null);
    }

    @Override
    public EstadoProgramarViaje estado() {
      return new EstadoProgramarViaje(etapa, List.copyOf(pasos), null, motivo, null);
    }
  }
}
