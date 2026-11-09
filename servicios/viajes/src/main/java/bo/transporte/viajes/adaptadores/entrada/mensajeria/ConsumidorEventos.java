package bo.transporte.viajes.adaptadores.entrada.mensajeria;

import bo.transporte.viajes.aplicacion.viaje.CierreDeViaje;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Consumidor de viajes.eventos (topología en plataforma/compose/rabbitmq). Lo que no es JSON, no trae los datos
 * esperados o no tiene manejador va a la DLQ sin reencolar (FC3); un error técnico se reencola y la cola de quórum lo
 * manda a la DLQ al pasar su límite de entregas.
 */
@Component
class ConsumidorEventos {
    private static final Logger LOG = LoggerFactory.getLogger(ConsumidorEventos.class);
    private final CierreDeViaje cierre;
    private final JsonMapper json;

    ConsumidorEventos(CierreDeViaje cierre, JsonMapper json) {
        this.cierre = cierre;
        this.json = json;
    }

    @RabbitListener(queues = "viajes.eventos", autoStartup = "${consumidor.habilitado:true}")
    void recibir(Message mensaje) {
        JsonNode sobre;
        UUID eventId;
        try {
            sobre = json.readTree(mensaje.getBody());
            eventId = UUID.fromString(sobre.get("id").asString());
        } catch (RuntimeException e) {
            throw new AmqpRejectAndDontRequeueException("Mensaje inválido: va a la DLQ", e);
        }
        String tipo = sobre.path("tipo").asString("");
        MDC.put("correlationId", sobre.path("correlationId").asString(null));
        try {
            switch (tipo) {
                case "FacturaEmitida" -> {
                    JsonNode d = sobre.get("datos");
                    UUID viajeId, facturaId;
                    String numero;
                    try {
                        viajeId = UUID.fromString(d.get("viajeId").asString());
                        facturaId = UUID.fromString(d.get("facturaId").asString());
                        numero = d.get("numero").asString();
                    } catch (RuntimeException e) {
                        throw new AmqpRejectAndDontRequeueException("FacturaEmitida sin datos: va a la DLQ", e);
                    }
                    cierre.facturaEmitida(eventId, viajeId, facturaId, numero);
                }
                default -> {
                    LOG.warn("Evento {} sin manejador: va a la DLQ", tipo);
                    throw new AmqpRejectAndDontRequeueException("Sin manejador para " + tipo);
                }
            }
        } finally {
            MDC.remove("correlationId");
        }
    }
}
