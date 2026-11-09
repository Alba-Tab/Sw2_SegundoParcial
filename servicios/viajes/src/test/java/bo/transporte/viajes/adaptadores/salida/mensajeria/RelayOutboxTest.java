package bo.transporte.viajes.adaptadores.salida.mensajeria;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.UnknownHostException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.amqp.AmqpConnectException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Con el broker caído: un WARN de una línea por intento, sin pila, y una espera que se duplica hasta el máximo. */
@ExtendWith(OutputCaptureExtension.class)
class RelayOutboxTest {
    static final class Reloj extends Clock {
        Instant ahora = Instant.parse("2026-10-30T12:00:00Z");

        void avanzar(Duration d) {
            ahora = ahora.plus(d);
        }

        @Override
        public Instant instant() {
            return ahora;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zona) {
            return this;
        }
    }

    final Reloj reloj = new Reloj();
    final JdbcClient jdbc = mock(JdbcClient.class, RETURNS_DEEP_STUBS);
    final RabbitTemplate rabbit = mock(RabbitTemplate.class);
    final RelayOutbox relay = new RelayOutbox(jdbc, rabbit, 100, Duration.ofSeconds(1), Duration.ofSeconds(4), reloj);

    @Test
    @SuppressWarnings("unchecked")
    void conElBrokerCaidoAvisaEnUnaLineaYEsperaCadaVezMas(CapturedOutput salida) {
        when(jdbc.sql(anyString())
                        .param(anyString(), any())
                        .query(any(RowMapper.class))
                        .list())
                .thenReturn(List.of(new RelayOutbox.Pendiente(UUID.randomUUID(), "viajes.x.v1", "{}")));
        when(rabbit.invoke(any())).thenThrow(new AmqpConnectException(new UnknownHostException("rabbitmq")));

        relay.publicarPendientes(); // falla: espera 1 s
        relay.publicarPendientes(); // dentro de la espera: ni lo intenta
        verify(rabbit, times(1)).invoke(any());
        assertTrue(salida.getOut().contains("el broker no responde (java.net.UnknownHostException: rabbitmq)"));
        assertTrue(salida.getOut().contains("intento 1, el siguiente en 1 s"));

        reloj.avanzar(Duration.ofSeconds(1));
        relay.publicarPendientes(); // falla: espera 2 s
        reloj.avanzar(Duration.ofSeconds(1));
        relay.publicarPendientes(); // todavía no
        verify(rabbit, times(2)).invoke(any());
        assertTrue(salida.getOut().contains("intento 2, el siguiente en 2 s"));

        for (int i = 0; i < 3; i++) {
            reloj.avanzar(Duration.ofSeconds(4));
            relay.publicarPendientes();
        }
        assertTrue(salida.getOut().contains("intento 5, el siguiente en 4 s"), "no pasa del máximo");
        assertFalse(salida.getOut().contains("\tat "), "sin pila");
        assertFalse(salida.getOut().contains("ERROR"));

        doReturn(null).when(rabbit).invoke(any());
        reloj.avanzar(Duration.ofSeconds(4));
        relay.publicarPendientes();
        assertTrue(salida.getOut().contains("volvió a responder después de 5 intentos fallidos"));
        verify(jdbc).sql("UPDATE outbox_eventos SET publicado_en = now() WHERE id IN (:ids)");
    }
}
