package poc.viajes;

import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowClientOptions;
import io.temporal.serviceclient.WorkflowServiceStubs;
import io.temporal.serviceclient.WorkflowServiceStubsOptions;
import io.temporal.worker.WorkerFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import poc.viajes.Contrato.*;

/** Worker de la cola `viajes`: workflow ProgramarViaje y actividades Viajes.* (en memoria; solo registran la llamada). */
public class Main {
  private static final Logger LOG = LoggerFactory.getLogger("viajes");

  static class ViajesImpl implements Actividades.Viajes {
    @Override public void crearViaje(CrearViajeEntrada e) { LOG.info("ACTIVIDAD Viajes.crearViaje viajeId={}", e.viajeId()); }
    @Override public void confirmarViaje(ConfirmarViajeEntrada e) {
      LOG.info("ACTIVIDAD Viajes.confirmarViaje viajeId={} placa={} chofer={} monto={} {} fecha={}",
          e.viajeId(), e.placa(), e.choferNombre(), e.monto().monto(), e.monto().moneda(), e.fechaViaje());
    }
    @Override public void marcarConfirmacionCompleta(MarcarConfirmacionCompletaEntrada e) {
      LOG.info("ACTIVIDAD Viajes.marcarConfirmacionCompleta servicioId={}", e.servicioId());
    }
    @Override public void cancelarViaje(CancelarViajeEntrada e) {
      LOG.info("ACTIVIDAD Viajes.cancelarViaje viajeId={} motivo={} detalle=\"{}\"", e.viajeId(), e.motivo(), e.detalle());
    }
  }

  public static void main(String[] args) {
    var direccion = System.getenv().getOrDefault("TEMPORAL_ADDRESS", "localhost:7233");
    var servicio = WorkflowServiceStubs.newServiceStubs(WorkflowServiceStubsOptions.newBuilder().setTarget(direccion).build());
    var cliente = WorkflowClient.newInstance(servicio, WorkflowClientOptions.newBuilder()
        .setNamespace("transporte").setDataConverter(Jackson3Conversor.dataConverter()).build());
    var fabrica = WorkerFactory.newInstance(cliente);
    var worker = fabrica.newWorker("viajes");
    worker.registerWorkflowImplementationTypes(ProgramarViaje.Impl.class);
    worker.registerActivitiesImplementations(new ViajesImpl());
    fabrica.start();
    LOG.info("worker viajes conectado a {} (Java {}, Jackson 3)", direccion, Runtime.version());
  }
}
