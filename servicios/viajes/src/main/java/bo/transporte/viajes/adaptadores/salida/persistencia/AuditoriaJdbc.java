package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.Auditoria;
import bo.transporte.viajes.dominio.comun.Uuid7;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Component
class AuditoriaJdbc implements Auditoria {
    private final JdbcClient jdbc;
    private final JsonMapper json;

    AuditoriaJdbc(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void registrar(
            Solicitante actor, String canal, String accion, String entidad, UUID entidadId, Map<String, Object> datos) {
        String rol = actor.roles().stream()
                .filter(Solicitante.ROLES_INTERNOS::contains)
                .findFirst()
                .orElse(actor.roles().contains("cliente") ? "cliente" : null);
        String correlacion = MDC.get("correlationId");
        jdbc.sql(
                        "INSERT INTO auditoria (id, ocurrido_en, actor_sub, actor_rol, canal, accion, entidad, entidad_id, datos, correlation_id)"
                                + " VALUES (:id, :en, :sub, :rol, :canal, :accion, :entidad, :entidadId, CAST(:datos AS jsonb), :correlacion)")
                .param("id", Uuid7.nuevo())
                .param("en", Timestamp.from(Instant.now()))
                .param("sub", actor.sub())
                .param("rol", rol)
                .param("canal", canal)
                .param("accion", accion)
                .param("entidad", entidad)
                .param("entidadId", entidadId)
                .param("datos", json.writeValueAsString(datos))
                .param("correlacion", correlacion == null ? null : UUID.fromString(correlacion))
                .update();
    }
}
