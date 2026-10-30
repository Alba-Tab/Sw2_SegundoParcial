package bo.transporte.viajes.adaptadores.entrada.programado;

import bo.transporte.viajes.aplicacion.dispositivo.AvisosPush;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Consumidor interno del Outbox (D45): lee los eventos ya publicados (después del commit, nunca dentro del caso de uso
 * ni de una actividad de Temporal) que todavía no tienen fila en notificacion_push y los pasa a {@link AvisosPush}.
 */
@Component
class ConsumidorOutboxPush {
    private static final Logger LOG = LoggerFactory.getLogger(ConsumidorOutboxPush.class);

    private record Evento(UUID id, String tipo, String sobre) {}

    private final JdbcClient jdbc;
    private final AvisosPush avisos;
    private final JsonMapper json;

    ConsumidorOutboxPush(JdbcClient jdbc, AvisosPush avisos, JsonMapper json) {
        this.jdbc = jdbc;
        this.avisos = avisos;
        this.json = json;
    }

    @Scheduled(fixedDelayString = "${push.intervalo:PT2S}")
    public void avisar() {
        List<Evento> eventos = jdbc.sql("""
                        SELECT o.id, o.tipo, o.sobre::text FROM outbox_eventos o
                        WHERE o.publicado_en > now() - interval '1 day' AND o.tipo IN (:tipos)
                          AND NOT EXISTS (SELECT 1 FROM notificacion_push n WHERE n.evento_id = o.id)
                        ORDER BY o.publicado_en LIMIT 50""")
                .param("tipos", AvisosPush.TIPOS)
                .query((rs, i) -> new Evento(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3)))
                .list();
        for (Evento e : eventos) {
            try {
                Map<String, Object> sobre = json.readValue(e.sobre(), new TypeReference<>() {});
                @SuppressWarnings("unchecked")
                var datos = (Map<String, Object>) sobre.get("datos");
                String r = avisos.procesar(e.id(), e.tipo(), datos);
                if (r != null && !"NO_APLICA".equals(r)) LOG.info("Push {} de {}: {}", e.tipo(), e.id(), r);
            } catch (RuntimeException ex) {
                LOG.warn("Push de {} no procesado: {}", e.id(), ex.getMessage());
            }
        }
    }
}
