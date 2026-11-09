package bo.transporte.viajes.adaptadores.salida.mensajeria;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Publica outbox_eventos en transporte.events con confirmación del broker y marca publicado_en (000 §6).
 * FOR UPDATE SKIP LOCKED permite varias instancias sin publicar dos veces la misma fila. Si el broker no confirma,
 * las filas quedan sin publicado_en y se reintentan (FC5). Con el broker caído, un WARN de una línea por intento y una
 * espera que se duplica de {@code outbox.espera-minima} a {@code outbox.espera-maxima}, en lugar de la pila cada segundo.
 */
@Component
class RelayOutbox {
    private static final Logger LOG = LoggerFactory.getLogger(RelayOutbox.class);
    static final String EXCHANGE = "transporte.events";

    record Pendiente(UUID id, String clave, String sobre) {}

    private final JdbcClient jdbc;
    private final RabbitTemplate rabbit;
    private final int lote;
    private final Duration esperaMinima;
    private final Duration esperaMaxima;
    private final Clock reloj;
    private int fallos;
    private Instant proximoIntento = Instant.MIN;

    RelayOutbox(
            JdbcClient jdbc,
            RabbitTemplate rabbit,
            @Value("${outbox.lote:100}") int lote,
            @Value("${outbox.espera-minima:PT1S}") Duration esperaMinima,
            @Value("${outbox.espera-maxima:PT1M}") Duration esperaMaxima,
            Clock reloj) {
        this.jdbc = jdbc;
        this.rabbit = rabbit;
        this.lote = lote;
        this.esperaMinima = esperaMinima;
        this.esperaMaxima = esperaMaxima;
        this.reloj = reloj;
    }

    @Scheduled(fixedDelayString = "${outbox.intervalo:PT1S}")
    @Transactional
    public void publicarPendientes() {
        if (reloj.instant().isBefore(proximoIntento)) return;
        List<Pendiente> pendientes = jdbc.sql("""
				SELECT id, clave_enrutamiento, sobre::text FROM outbox_eventos
				WHERE publicado_en IS NULL ORDER BY creado_en LIMIT :lote FOR UPDATE SKIP LOCKED""")
                .param("lote", lote)
                .query((rs, i) -> new Pendiente(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3)))
                .list();
        if (pendientes.isEmpty()) return;
        try {
            rabbit.invoke(ops -> {
                for (Pendiente p : pendientes) ops.send(EXCHANGE, p.clave(), mensaje(p));
                ops.waitForConfirmsOrDie(Duration.ofSeconds(10).toMillis());
                return null;
            });
        } catch (AmqpException e) {
            // Sin publicado_en: las filas siguen pendientes y se sueltan al terminar la transacción.
            fallo(e);
            return;
        }
        if (fallos > 0) LOG.info("Outbox: el broker volvió a responder después de {} intentos fallidos", fallos);
        fallos = 0;
        proximoIntento = Instant.MIN;
        jdbc.sql("UPDATE outbox_eventos SET publicado_en = now() WHERE id IN (:ids)")
                .param("ids", pendientes.stream().map(Pendiente::id).toList())
                .update();
        LOG.info("Outbox: {} eventos publicados", pendientes.size());
    }

    private void fallo(AmqpException e) {
        fallos++;
        Duration espera = esperaMinima.multipliedBy(1L << Math.min(fallos - 1, 20));
        if (espera.compareTo(esperaMaxima) > 0) espera = esperaMaxima;
        proximoIntento = reloj.instant().plus(espera);
        LOG.warn(
                "Outbox: el broker no responde ({}); intento {}, el siguiente en {} s",
                NestedExceptionUtils.getMostSpecificCause(e).toString(),
                fallos,
                espera.toSeconds());
    }

    private static Message mensaje(Pendiente p) {
        return MessageBuilder.withBody(p.sobre().getBytes(StandardCharsets.UTF_8))
                .setContentType(MessageProperties.CONTENT_TYPE_JSON)
                .setContentEncoding("UTF-8")
                .setMessageId(p.id().toString())
                .setDeliveryMode(org.springframework.amqp.core.MessageDeliveryMode.PERSISTENT)
                .build();
    }
}
