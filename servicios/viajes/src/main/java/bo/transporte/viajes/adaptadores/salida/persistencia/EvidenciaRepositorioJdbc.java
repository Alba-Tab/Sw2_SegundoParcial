package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.puerto.salida.EvidenciaRepositorio;
import bo.transporte.viajes.dominio.viaje.Evidencia;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
class EvidenciaRepositorioJdbc implements EvidenciaRepositorio {
    private static final String COLUMNAS =
            "evidencia_id, viaje_id, tipo, content_type, tamano_bytes, upload_id, estado";
    private final JdbcClient jdbc;

    EvidenciaRepositorioJdbc(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<Evidencia> porId(UUID evidenciaId) {
        return jdbc.sql("SELECT " + COLUMNAS + " FROM evidencia WHERE evidencia_id = :id")
                .param("id", evidenciaId)
                .query((rs, i) -> fila(rs))
                .optional();
    }

    @Override
    public List<Evidencia> porIds(List<UUID> evidenciaIds) {
        if (evidenciaIds.isEmpty()) return List.of();
        return jdbc.sql("SELECT " + COLUMNAS + " FROM evidencia WHERE evidencia_id IN (:ids)")
                .param("ids", evidenciaIds)
                .query((rs, i) -> fila(rs))
                .list();
    }

    @Override
    public boolean insertar(Evidencia e) {
        return jdbc.sql("""
                        INSERT INTO evidencia (evidencia_id, viaje_id, tipo, content_type, tamano_bytes, upload_id, estado)
                        VALUES (:id, :viaje, :tipo, :contentType, :tamano, :uploadId, 'SUBIENDO')
                        ON CONFLICT (evidencia_id) DO NOTHING""")
                        .param("id", e.evidenciaId())
                        .param("viaje", e.viajeId())
                        .param("tipo", e.tipo().name())
                        .param("contentType", e.contentType())
                        .param("tamano", e.tamanoBytes())
                        .param("uploadId", e.uploadId())
                        .update()
                == 1;
    }

    @Override
    public void marcarCompleta(UUID evidenciaId) {
        jdbc.sql("UPDATE evidencia SET estado = 'COMPLETA', completada_en = now() WHERE evidencia_id = :id")
                .param("id", evidenciaId)
                .update();
    }

    private static Evidencia fila(ResultSet rs) throws SQLException {
        return new Evidencia(
                rs.getObject("evidencia_id", UUID.class),
                rs.getObject("viaje_id", UUID.class),
                Evidencia.Tipo.valueOf(rs.getString("tipo")),
                rs.getString("content_type"),
                rs.getLong("tamano_bytes"),
                rs.getString("upload_id"),
                "COMPLETA".equals(rs.getString("estado")));
    }
}
