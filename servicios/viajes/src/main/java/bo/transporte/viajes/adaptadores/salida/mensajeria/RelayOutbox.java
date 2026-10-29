package bo.transporte.viajes.adaptadores.salida.mensajeria;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Publica outbox_eventos en transporte.events con confirmación del broker y marca publicado_en (000 §6).
 * FOR UPDATE SKIP LOCKED permite varias instancias sin publicar dos veces la misma fila. Si el broker no confirma,
 * la transacción se revierte y la fila se reintenta en la siguiente vuelta (FC5).
 */
@Component
class RelayOutbox {
    private static final Logger LOG = LoggerFactory.getLogger(RelayOutbox.class);
    static final String EXCHANGE = "transporte.events";

    private record Pendiente(UUID id, String clave, String sobre) {}

    private final JdbcClient jdbc;
    private final RabbitTemplate rabbit;
    private final int lote;

    RelayOutbox(JdbcClient jdbc, RabbitTemplate rabbit, @Value("${outbox.lote:100}") int lote) {
        this.jdbc = jdbc;
        this.rabbit = rabbit;
        this.lote = lote;
    }

    @Scheduled(fixedDelayString = "${outbox.intervalo:PT1S}")
    @Transactional
    public void publicarPendientes() {
        List<Pendiente> pendientes = jdbc.sql("""
				SELECT id, clave_enrutamiento, sobre::text FROM outbox_eventos
				WHERE publicado_en IS NULL ORDER BY creado_en LIMIT :lote FOR UPDATE SKIP LOCKED""")
                .param("lote", lote)
                .query((rs, i) -> new Pendiente(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3)))
                .list();
        if (pendientes.isEmpty()) return;
        rabbit.invoke(ops -> {
            for (Pendiente p : pendientes) ops.send(EXCHANGE, p.clave(), mensaje(p));
            ops.waitForConfirmsOrDie(Duration.ofSeconds(10).toMillis());
            return null;
        });
        jdbc.sql("UPDATE outbox_eventos SET publicado_en = now() WHERE id IN (:ids)")
                .param("ids", pendientes.stream().map(Pendiente::id).toList())
                .update();
        LOG.info("Outbox: {} eventos publicados", pendientes.size());
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
