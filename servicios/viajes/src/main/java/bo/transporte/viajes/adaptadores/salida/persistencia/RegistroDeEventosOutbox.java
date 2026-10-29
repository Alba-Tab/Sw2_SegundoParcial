package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.puerto.salida.RegistroDeEventos;
import bo.transporte.viajes.dominio.comun.Uuid7;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Escribe el sobre común (000 §6) en outbox_eventos dentro de la transacción del caso de uso, después de validarlo
 * contra su esquema. correlationId y traceparent son obligatorios en el sobre: si no hay petición ni traza en curso
 * (un consumidor, un job), se generan.
 */
@Component
class RegistroDeEventosOutbox implements RegistroDeEventos {
    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final EsquemasDeEventos esquemas;

    RegistroDeEventosOutbox(JdbcClient jdbc, JsonMapper json, EsquemasDeEventos esquemas) {
        this.jdbc = jdbc;
        this.json = json;
        this.esquemas = esquemas;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void registrar(String tipo, String claveEnrutamiento, Object datos) {
        UUID id = Uuid7.nuevo();
        Instant ahora = Instant.now();
        Map<String, Object> sobre = new LinkedHashMap<>();
        sobre.put("id", id.toString());
        sobre.put("tipo", tipo);
        sobre.put("version", Integer.parseInt(claveEnrutamiento.substring(claveEnrutamiento.lastIndexOf(".v") + 2)));
        sobre.put("ocurridoEn", ahora.toString());
        String correlacion = MDC.get("correlationId");
        sobre.put(
                "correlationId",
                correlacion != null ? correlacion : Uuid7.nuevo().toString());
        sobre.put("traceparent", traceparent());
        sobre.put("productor", "viajes");
        sobre.put("datos", datos);
        int version = (Integer) sobre.get("version");
        esquemas.validar(tipo, version, json.valueToTree(sobre));
        jdbc.sql("""
				INSERT INTO outbox_eventos (id, tipo, clave_enrutamiento, sobre, creado_en)
				VALUES (:id, :tipo, :clave, CAST(:sobre AS jsonb), :creadoEn)""")
                .param("id", id)
                .param("tipo", tipo)
                .param("clave", claveEnrutamiento)
                .param("sobre", json.writeValueAsString(sobre))
                .param("creadoEn", Timestamp.from(ahora))
                .update();
    }

    /** W3C Trace Context de la traza en curso; sin traza, uno nuevo para que el consumidor pueda seguir el evento. */
    private static String traceparent() {
        String traza = MDC.get("traceId"), tramo = MDC.get("spanId");
        if (traza != null && traza.length() == 32 && tramo != null && tramo.length() == 16)
            return "00-" + traza + "-" + tramo + "-01";
        var azar = java.util.concurrent.ThreadLocalRandom.current();
        return "00-%016x%016x-%016x-01".formatted(azar.nextLong(), azar.nextLong(), azar.nextLong());
    }
}
