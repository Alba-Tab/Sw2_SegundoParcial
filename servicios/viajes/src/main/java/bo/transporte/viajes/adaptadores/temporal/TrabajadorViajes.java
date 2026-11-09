package bo.transporte.viajes.adaptadores.temporal;

import io.temporal.client.WorkflowClient;
import io.temporal.worker.WorkerFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

/**
 * Worker de la cola viajes: el workflow ProgramarViaje y las actividades Viajes.*. Arranca con la aplicación y se
 * detiene antes que la base (SmartLifecycle), así una actividad en curso termina o Temporal la reintenta.
 */
@Component
class TrabajadorViajes implements SmartLifecycle {
    private static final Logger LOG = LoggerFactory.getLogger(TrabajadorViajes.class);
    private final WorkerFactory fabrica;
    private final boolean habilitado;
    private volatile boolean corriendo;

    TrabajadorViajes(
            WorkflowClient cliente,
            ActividadesViajes actividades,
            @Value("${temporal.worker.habilitado:true}") boolean habilitado) {
        this.fabrica = WorkerFactory.newInstance(cliente);
        this.habilitado = habilitado;
        var worker = fabrica.newWorker(ProgramarViaje.COLA);
        worker.registerWorkflowImplementationTypes(ProgramarViajeImpl.class);
        worker.registerActivitiesImplementations(actividades);
    }

    @Override
    public void start() {
        if (!habilitado) return;
        fabrica.start();
        corriendo = true;
        LOG.info("Worker de Temporal escuchando la cola {}", ProgramarViaje.COLA);
    }

    @Override
    public void stop() {
        if (corriendo) fabrica.shutdown();
        corriendo = false;
    }

    @Override
    public boolean isRunning() {
        return corriendo;
    }
}
