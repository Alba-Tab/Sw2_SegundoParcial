package bo.transporte.viajes.adaptadores.temporal;

import io.grpc.netty.shaded.io.grpc.netty.GrpcSslContexts;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowClientOptions;
import io.temporal.serviceclient.WorkflowServiceStubs;
import io.temporal.serviceclient.WorkflowServiceStubsOptions;
import java.io.File;
import java.time.Duration;
import javax.net.ssl.SSLException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Cliente de Temporal (namespace transporte, D14) con el conversor del contrato. La conexión es perezosa: Viajes arranca
 * y responde /health aunque Temporal no esté (P10). Las consultas tienen 2 s para no frenar GET /servicios/{id}.
 * Con temporal.tls.* (B1) la conexión es mTLS: la CA propia y el certificado {@code cliente-viajes}. Lo usan el cliente y
 * {@link TrabajadorViajes}.
 */
@Configuration
class TemporalConfig {

    @Bean(destroyMethod = "shutdown")
    WorkflowServiceStubs servicioTemporal(
            @Value("${temporal.direccion}") String direccion,
            @Value("${temporal.tls.ca:}") String ca,
            @Value("${temporal.tls.cert:}") String cert,
            @Value("${temporal.tls.key:}") String key)
            throws SSLException {
        return WorkflowServiceStubs.newServiceStubs(opciones(direccion, ca, cert, key));
    }

    /** Sin CA, sin TLS (compose local). La clave va en PKCS#8 (BEGIN PRIVATE KEY), como la genera certificados.sh. */
    static WorkflowServiceStubsOptions opciones(String direccion, String ca, String cert, String key)
            throws SSLException {
        var opciones =
                WorkflowServiceStubsOptions.newBuilder().setTarget(direccion).setRpcQueryTimeout(Duration.ofSeconds(2));
        if (!ca.isBlank()) {
            var tls = GrpcSslContexts.forClient().trustManager(new File(ca));
            if (!cert.isBlank() && !key.isBlank()) tls.keyManager(new File(cert), new File(key));
            opciones.setSslContext(tls.build());
        }
        return opciones.build();
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
