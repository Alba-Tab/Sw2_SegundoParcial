package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.puerto.salida.ServicioRepositorio;
import bo.transporte.viajes.dominio.comun.CanalServicio;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import bo.transporte.viajes.dominio.viaje.Servicio;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
class ServicioRepositorioJdbc implements ServicioRepositorio {
    private static final String COLUMNAS = "s.servicio_id, s.viaje_id AS s_viaje_id, s.cliente_id AS s_cliente_id,"
            + " s.cotizacion_id AS s_cotizacion_id, s.canal, s.creado_por, s.confirmacion_completa,"
            + " s.creado_en AS s_creado_en";
    private static final String CON_VIAJE = "SELECT " + COLUMNAS + ", " + ViajeRepositorioJdbc.COLUMNAS
            + " FROM servicio s LEFT JOIN viaje v ON v.servicio_id = s.servicio_id";
    private final JdbcClient jdbc;

    ServicioRepositorioJdbc(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void guardar(Servicio s) {
        jdbc.sql("""
                        INSERT INTO servicio (servicio_id, viaje_id, cliente_id, cotizacion_id, canal, creado_por,
                                              workflow_id, confirmacion_completa, creado_en)
                        VALUES (:id, :viaje, :cliente, :cotizacion, :canal, :creadoPor, :workflow, :completa, :creadoEn)""")
                .param("id", s.servicioId())
                .param("viaje", s.viajeId())
                .param("cliente", s.clienteId())
                .param("cotizacion", s.cotizacionId())
                .param("canal", s.canal().name())
                .param("creadoPor", s.creadoPor())
                .param("workflow", s.workflowId())
                .param("completa", s.confirmacionCompleta())
                .param("creadoEn", Timestamp.from(s.creadoEn()))
                .update();
    }

    @Override
    public Optional<Servicio> porId(UUID servicioId) {
        return jdbc.sql("SELECT " + COLUMNAS + " FROM servicio s WHERE s.servicio_id = :id")
                .param("id", servicioId)
                .query((rs, i) -> servicio(rs))
                .optional();
    }

    @Override
    public Optional<Servicio> porViajeId(UUID viajeId) {
        return jdbc.sql("SELECT " + COLUMNAS + " FROM servicio s WHERE s.viaje_id = :id")
                .param("id", viajeId)
                .query((rs, i) -> servicio(rs))
                .optional();
    }

    @Override
    public Optional<ConViaje> conViaje(UUID servicioId) {
        return jdbc.sql(CON_VIAJE + " WHERE s.servicio_id = :id")
                .param("id", servicioId)
                .query((rs, i) -> conViaje(rs))
                .optional();
    }

    @Override
    public List<ConViaje> listar(UUID clienteId, EstadoViaje estado, UUID antesDe, int limite) {
        return jdbc.sql(CON_VIAJE
                        + " WHERE (CAST(:cliente AS uuid) IS NULL OR s.cliente_id = :cliente)"
                        + " AND (CAST(:estado AS varchar) IS NULL OR COALESCE(v.estado, 'PROGRAMANDO') = :estado)"
                        + " AND (CAST(:antesDe AS uuid) IS NULL OR s.servicio_id < :antesDe)"
                        + " ORDER BY s.servicio_id DESC LIMIT :limite")
                .param("cliente", clienteId)
                .param("estado", estado == null ? null : estado.name())
                .param("antesDe", antesDe)
                .param("limite", limite)
                .query((rs, i) -> conViaje(rs))
                .list();
    }

    @Override
    public void marcarConfirmacionCompleta(UUID servicioId) {
        jdbc.sql("UPDATE servicio SET confirmacion_completa = true WHERE servicio_id = :id")
                .param("id", servicioId)
                .update();
    }

    private static ConViaje conViaje(ResultSet rs) throws SQLException {
        return new ConViaje(servicio(rs), rs.getObject("viaje_id") == null ? null : ViajeRepositorioJdbc.viaje(rs));
    }

    private static Servicio servicio(ResultSet rs) throws SQLException {
        return new Servicio(
                rs.getObject("servicio_id", UUID.class),
                rs.getObject("s_viaje_id", UUID.class),
                rs.getObject("s_cliente_id", UUID.class),
                rs.getObject("s_cotizacion_id", UUID.class),
                CanalServicio.valueOf(rs.getString("canal")),
                rs.getString("creado_por"),
                rs.getBoolean("confirmacion_completa"),
                rs.getTimestamp("s_creado_en").toInstant());
    }
}
