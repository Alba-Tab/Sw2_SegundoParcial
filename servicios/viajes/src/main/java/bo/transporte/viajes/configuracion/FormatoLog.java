package bo.transporte.viajes.configuracion;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.logging.structured.StructuredLogFormatter;
import tools.jackson.databind.json.JsonMapper;

/** Logs JSON de una línea con los campos de 000 §10: timestamp, nivel, servicio, correlationId, traceId, mensaje. */
public class FormatoLog implements StructuredLogFormatter<ILoggingEvent> {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Override
    public String format(ILoggingEvent e) {
        Map<String, Object> linea = new LinkedHashMap<>();
        linea.put("timestamp", Instant.ofEpochMilli(e.getTimeStamp()).toString());
        linea.put("nivel", e.getLevel().toString());
        linea.put("servicio", "viajes");
        linea.put("correlationId", e.getMDCPropertyMap().get("correlationId"));
        linea.put("traceId", e.getMDCPropertyMap().get("traceId"));
        linea.put("logger", e.getLoggerName());
        linea.put("mensaje", e.getFormattedMessage());
        if (e.getThrowableProxy() != null) linea.put("error", ThrowableProxyUtil.asString(e.getThrowableProxy()));
        return JSON.writeValueAsString(linea) + "\n";
    }
}
