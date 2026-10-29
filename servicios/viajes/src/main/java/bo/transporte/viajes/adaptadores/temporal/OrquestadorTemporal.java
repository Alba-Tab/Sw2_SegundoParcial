package bo.transporte.viajes.adaptadores.temporal;

import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.Compensacion;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.EntradaProgramarViaje;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.EstadoProgramarViaje;
import bo.transporte.viajes.aplicacion.puerto.salida.Orquestador;
import bo.transporte.viajes.aplicacion.servicio.ParametrosSaga;
import bo.transporte.viajes.dominio.viaje.Servicio;
import io.temporal.api.enums.v1.WorkflowIdConflictPolicy;
import io.temporal.api.enums.v1.WorkflowIdReusePolicy;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowExecutionAlreadyStarted;
import io.temporal.client.WorkflowOptions;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Inicia ProgramarViaje con REJECT_DUPLICATE y conflicto FAIL; {@code WorkflowExecutionAlreadyStarted} es éxito (D43).
 * La etapa sale de la consulta {@code estado}; si Temporal no responde se devuelve vacío y la API muestra DESCONOCIDA.
 */
@Component
class OrquestadorTemporal implements Orquestador {
    private static final Logger LOG = LoggerFactory.getLogger(OrquestadorTemporal.class);
    private final WorkflowClient cliente;

    OrquestadorTemporal(WorkflowClient cliente) {
        this.cliente = cliente;
    }

    @Override
    public void iniciar(Servicio s, ParametrosSaga p) {
        var opciones = WorkflowOptions.newBuilder()
                .setWorkflowId(s.workflowId())
                .setTaskQueue(ProgramarViaje.COLA)
                .setWorkflowIdReusePolicy(WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE)
                .setWorkflowIdConflictPolicy(WorkflowIdConflictPolicy.WORKFLOW_ID_CONFLICT_POLICY_FAIL)
                .build();
        var entrada = new EntradaProgramarViaje(
                s.servicioId(),
                s.viajeId(),
                s.clienteId(),
                s.cotizacionId(),
                s.canal().name(),
                s.creadoPor(),
                new ContratoSaga.ParametrosSaga(
                        p.esperaAprobacion(),
                        new Compensacion(p.compensacionScheduleToClose(), p.compensacionMaximoIntentos())));
        try {
            WorkflowClient.start(cliente.newWorkflowStub(ProgramarViaje.class, opciones)::ejecutar, entrada);
        } catch (WorkflowExecutionAlreadyStarted e) {
            LOG.info("El workflow {} ya estaba iniciado (D43)", s.workflowId());
        } catch (RuntimeException e) {
            throw new NoDisponible("Temporal no respondió al iniciar " + s.workflowId(), e);
        }
    }

    @Override
    public Optional<String> etapa(String workflowId) {
        try {
            EstadoProgramarViaje estado =
                    cliente.newWorkflowStub(ProgramarViaje.class, workflowId).estado();
            return Optional.ofNullable(estado.etapa());
        } catch (RuntimeException e) {
            LOG.debug("Sin etapa para {}: {}", workflowId, e.getMessage());
            return Optional.empty();
        }
    }
}
