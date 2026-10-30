package bo.transporte.viajes;

import org.springframework.amqp.core.Queue;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.rabbitmq.RabbitMQContainer;
import org.testcontainers.utility.DockerImageName;

/** Las mismas versiones que plataforma/compose, y Temporal en memoria. */
@TestConfiguration(proxyBeanMethods = false)
@Import(TemporalDePrueba.class)
class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgresContainer() {
        return new PostgreSQLContainer(DockerImageName.parse("postgres:17"));
    }

    /** La cola del consumidor; en el compose la crea la topología de plataforma/compose/rabbitmq. */
    @Bean
    Queue colaViajes() {
        return new Queue("viajes.eventos");
    }

    @Bean
    @ServiceConnection
    RabbitMQContainer rabbitContainer() {
        return new RabbitMQContainer(DockerImageName.parse("rabbitmq:4.4.0-management"));
    }
}
