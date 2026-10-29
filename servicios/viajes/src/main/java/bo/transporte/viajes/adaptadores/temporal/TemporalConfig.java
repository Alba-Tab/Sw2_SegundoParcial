package bo.transporte.viajes.adaptadores.temporal;

import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowClientOptions;
import io.temporal.serviceclient.WorkflowServiceStubs;
import io.temporal.serviceclient.WorkflowServiceStubsOptions;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Cliente de Temporal (namespace transporte, D14) con el conversor del contrato. La conexión es perezosa: Viajes arranca
 * y responde /health aunque Temporal no esté (P10). Las consultas tienen 2 s para no frenar GET /servicios/{id}.
 */
@Configuration
class TemporalConfig {

    @Bean(destroyMethod = "shutdown")
    WorkflowServiceStubs servicioTemporal(@Value("${temporal.direccion}") String direccion) {
        return WorkflowServiceStubs.newServiceStubs(WorkflowServiceStubsOptions.newBuilder()
                .setTarget(direccion)
                .setRpcQueryTimeout(Duration.ofSeconds(2))
                .build());
    }

    @Bean
    WorkflowClient clienteTemporal(WorkflowServiceStubs servicio, @Value("${temporal.namespace}") String namespace) {
        return WorkflowClient.newInstance(
                servicio,
                WorkflowClientOptions.newBuilder()
                        .setNamespace(namespace)
                        .setDataConverter(ConversorTemporal.dataConverter())
                        .build());
    }
}
