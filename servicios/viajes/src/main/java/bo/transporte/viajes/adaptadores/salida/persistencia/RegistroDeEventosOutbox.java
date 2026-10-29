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

/** Escribe el sobre común (000 §6) en outbox_eventos dentro de la transacción del caso de uso. */
@Component
class RegistroDeEventosOutbox implements RegistroDeEventos {
	private final JdbcClient jdbc;
	private final JsonMapper json;

	RegistroDeEventosOutbox(JdbcClient jdbc, JsonMapper json) {
		this.jdbc = jdbc;
		this.json = json;
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
		sobre.put("correlationId", MDC.get("correlationId"));
		String traza = MDC.get("traceId"), tramo = MDC.get("spanId");
		if (traza != null && tramo != null) sobre.put("traceparent", "00-" + traza + "-" + tramo + "-01");
		sobre.put("productor", "viajes");
		sobre.put("datos", datos);
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
}
