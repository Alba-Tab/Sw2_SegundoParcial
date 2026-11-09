package bo.transporte.viajes;

import java.net.URI;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

/** RustFS, el mismo S3 local del compose, con el bucket de evidencias creado. */
@TestConfiguration(proxyBeanMethods = false)
public class AlmacenDePrueba {
    static final String BUCKET = "transporte-evidencias";

    @Bean(destroyMethod = "stop")
    GenericContainer<?> rustfs() {
        var c = new GenericContainer<>("rustfs/rustfs:1.0.4")
                .withEnv("RUSTFS_ACCESS_KEY", "local")
                .withEnv("RUSTFS_SECRET_KEY", "local-secreto")
                .withExposedPorts(9000)
                .waitingFor(Wait.forListeningPort());
        c.start();
        String endpoint = "http://" + c.getHost() + ":" + c.getMappedPort(9000);
        try (var s3 = S3Client.builder()
                .region(Region.US_EAST_1)
                .endpointOverride(URI.create(endpoint))
                .forcePathStyle(true)
                .credentialsProvider(
                        StaticCredentialsProvider.create(AwsBasicCredentials.create("local", "local-secreto")))
                .build()) {
            for (int i = 0; ; i++) {
                try {
                    s3.createBucket(b -> b.bucket(BUCKET));
                    break;
                } catch (RuntimeException e) {
                    if (i > 30) throw e;
                    try {
                        Thread.sleep(500);
                    } catch (InterruptedException ie) {
                        throw new IllegalStateException(ie);
                    }
                }
            }
        }
        return c;
    }

    @Bean
    DynamicPropertyRegistrar almacenPropiedades(GenericContainer<?> rustfs) {
        return r -> {
            String endpoint = "http://" + rustfs.getHost() + ":" + rustfs.getMappedPort(9000);
            r.add("almacen.endpoint", () -> endpoint);
            r.add("almacen.endpoint-publico", () -> endpoint);
            r.add("almacen.clave-acceso", () -> "local");
            r.add("almacen.clave-secreta", () -> "local-secreto");
        };
    }
}
