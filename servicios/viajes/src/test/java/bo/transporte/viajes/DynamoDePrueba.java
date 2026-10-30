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
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeDefinition;
import software.amazon.awssdk.services.dynamodb.model.KeySchemaElement;
import software.amazon.awssdk.services.dynamodb.model.KeyType;
import software.amazon.awssdk.services.dynamodb.model.ScalarAttributeType;

/** DynamoDB Local, el mismo del compose, con las tablas de plataforma/compose/iniciar/aws-local.sh. */
@TestConfiguration(proxyBeanMethods = false)
public class DynamoDePrueba {
    public static GenericContainer<?> iniciar() {
        var c = new GenericContainer<>("amazon/dynamodb-local:3.3.2")
                .withCommand("-jar", "DynamoDBLocal.jar", "-inMemory", "-sharedDb")
                .withExposedPorts(8000)
                .waitingFor(Wait.forListeningPort());
        c.start();
        try (var d = cliente(endpoint(c))) {
            crearTabla(d, "gps_puntos", "viajeId", "tsSeq", 20);
            crearTabla(d, "sync_cursor", "dispositivoId", "viajeId", 5);
        }
        return c;
    }

    public static String endpoint(GenericContainer<?> c) {
        return "http://" + c.getHost() + ":" + c.getMappedPort(8000);
    }

    public static DynamoDbClient cliente(String endpoint) {
        return DynamoDbClient.builder()
                .region(Region.US_EAST_1)
                .endpointOverride(URI.create(endpoint))
                .credentialsProvider(
                        StaticCredentialsProvider.create(AwsBasicCredentials.create("local", "local-secreto")))
                .build();
    }

    private static void crearTabla(DynamoDbClient d, String tabla, String particion, String orden, long capacidad) {
        d.createTable(b -> b.tableName(tabla)
                .attributeDefinitions(
                        AttributeDefinition.builder()
                                .attributeName(particion)
                                .attributeType(ScalarAttributeType.S)
                                .build(),
                        AttributeDefinition.builder()
                                .attributeName(orden)
                                .attributeType(ScalarAttributeType.S)
                                .build())
                .keySchema(
                        KeySchemaElement.builder()
                                .attributeName(particion)
                                .keyType(KeyType.HASH)
                                .build(),
                        KeySchemaElement.builder()
                                .attributeName(orden)
                                .keyType(KeyType.RANGE)
                                .build())
                .provisionedThroughput(p -> p.readCapacityUnits(capacidad).writeCapacityUnits(capacidad)));
    }

    @Bean(destroyMethod = "stop")
    GenericContainer<?> dynamodb() {
        return iniciar();
    }

    @Bean
    DynamicPropertyRegistrar dynamoPropiedades(GenericContainer<?> dynamodb) {
        return r -> {
            r.add("gps.endpoint", () -> endpoint(dynamodb));
            r.add("almacen.clave-acceso", () -> "local");
            r.add("almacen.clave-secreta", () -> "local-secreto");
        };
    }
}
