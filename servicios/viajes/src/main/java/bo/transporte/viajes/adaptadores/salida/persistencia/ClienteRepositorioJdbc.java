package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.puerto.salida.ClienteRepositorio;
import bo.transporte.viajes.dominio.cliente.Cliente;
import bo.transporte.viajes.dominio.cliente.DatosCliente;
import bo.transporte.viajes.dominio.comun.CanalServicio;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
class ClienteRepositorioJdbc implements ClienteRepositorio {
    private static final String COLUMNAS =
            "cliente_id, sub, razon_social, nit, correo, telefono, direccion, canal, vinculado,"
                    + " creado_por, creado_en, version_agregado, activo";
    private final JdbcClient jdbc;

    ClienteRepositorioJdbc(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void guardar(Cliente c) {
        var d = c.datos();
        jdbc.sql("INSERT INTO cliente (" + COLUMNAS
                        + ") VALUES (:id, :sub, :razonSocial, :nit, :correo, :telefono, :direccion,"
                        + " :canal, :vinculado, :creadoPor, :creadoEn, :version, :activo)")
                .param("id", c.clienteId())
                .param("sub", c.sub())
                .param("razonSocial", d.razonSocial())
                .param("nit", d.nit())
                .param("correo", d.correo())
                .param("telefono", d.telefono())
                .param("direccion", d.direccion())
                .param("canal", c.canal().name())
                .param("vinculado", c.vinculado())
                .param("creadoPor", c.creadoPor())
                .param("creadoEn", Timestamp.from(c.creadoEn()))
                .param("version", c.versionAgregado())
                .param("activo", c.activo())
                .update();
    }

    @Override
    public void marcarVinculado(UUID clienteId) {
        jdbc.sql("UPDATE cliente SET vinculado = true WHERE cliente_id = :id AND sub IS NOT NULL")
                .param("id", clienteId)
                .update();
    }

    @Override
    public Optional<Cliente> porId(UUID clienteId) {
        return jdbc.sql("SELECT " + COLUMNAS + " FROM cliente WHERE cliente_id = :id")
                .param("id", clienteId)
                .query(this::fila)
                .optional();
    }

    @Override
    public List<Cliente> porIds(Collection<UUID> clienteIds) {
        if (clienteIds.isEmpty()) return List.of();
        return jdbc.sql("SELECT " + COLUMNAS + " FROM cliente WHERE cliente_id IN (:ids)")
                .param("ids", clienteIds)
                .query(this::fila)
                .list();
    }

    @Override
    public Optional<Cliente> porSub(String sub) {
        return jdbc.sql("SELECT " + COLUMNAS + " FROM cliente WHERE sub = :sub")
                .param("sub", sub)
                .query(this::fila)
                .optional();
    }

    @Override
    public Optional<Cliente> activoPorNit(String nit) {
        return jdbc.sql("SELECT " + COLUMNAS + " FROM cliente WHERE nit = :nit AND activo")
                .param("nit", nit)
                .query(this::fila)
                .optional();
    }

    @Override
    public List<Cliente> listar(String texto, UUID despuesDe, int limite) {
        String patron = texto == null || texto.isBlank()
                ? null
                : "%" + texto.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        return jdbc.sql("SELECT " + COLUMNAS + " FROM cliente WHERE activo"
                        + " AND (CAST(:patron AS text) IS NULL OR razon_social ILIKE :patron OR nit LIKE :patron)"
                        + " AND (CAST(:despues AS uuid) IS NULL OR cliente_id > :despues)"
                        + " ORDER BY cliente_id LIMIT :limite")
                .param("patron", patron)
                .param("despues", despuesDe)
                .param("limite", limite)
                .query(this::fila)
                .list();
    }

    private Cliente fila(ResultSet rs, int i) throws SQLException {
        return Cliente.reconstruir(
                rs.getObject("cliente_id", UUID.class),
                rs.getString("sub"),
                new DatosCliente(
                        rs.getString("razon_social"),
                        rs.getString("nit"),
                        rs.getString("correo"),
                        rs.getString("telefono"),
                        rs.getString("direccion")),
                CanalServicio.valueOf(rs.getString("canal")),
                rs.getString("creado_por"),
                rs.getTimestamp("creado_en").toInstant(),
                rs.getInt("version_agregado"),
                rs.getBoolean("activo"),
                rs.getBoolean("vinculado"));
    }
}
