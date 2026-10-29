package bo.transporte.viajes.adaptadores.temporal;

import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.EntradaProgramarViaje;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.EstadoProgramarViaje;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ResultadoProgramarViaje;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.SenalAprobacionCredito;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.SenalResolverIntervencion;
import io.temporal.workflow.QueryMethod;
import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;

/** Workflow de la saga (contratos/temporal/programar-viaje.md), cola {@code viajes}. */
@WorkflowInterface
public interface ProgramarViaje {
    String TIPO = "ProgramarViaje";
    String COLA = "viajes";

    static String workflowId(Object servicioId) {
        return "programar-viaje-" + servicioId;
    }

    @WorkflowMethod(name = TIPO)
    ResultadoProgramarViaje ejecutar(EntradaProgramarViaje entrada);

    @SignalMethod(name = "aprobacionCredito")
    void aprobacionCredito(SenalAprobacionCredito senal);

    @SignalMethod(name = "resolverIntervencion")
    void resolverIntervencion(SenalResolverIntervencion senal);

    @QueryMethod(name = "estado")
    EstadoProgramarViaje estado();
}
