package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.puerto.salida.RutaRepositorio;
import bo.transporte.viajes.dominio.ruta.Ruta;
import bo.transporte.viajes.dominio.ruta.Ruta.Coordenadas;
import bo.transporte.viajes.dominio.ruta.Ruta.Lugar;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
class RutaRepositorioJdbc implements RutaRepositorio {
    private final JdbcClient jdbc;

    RutaRepositorioJdbc(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Ruta> activas() {
        return jdbc.sql("SELECT * FROM ruta WHERE activa ORDER BY nombre")
                .query(this::fila)
                .list();
    }

    @Override
    public Optional<Ruta> porId(UUID rutaId) {
        return jdbc.sql("SELECT * FROM ruta WHERE ruta_id = :id")
                .param("id", rutaId)
                .query(this::fila)
                .optional();
    }

    @Override
    public List<Ruta> porIds(Collection<UUID> rutaIds) {
        if (rutaIds.isEmpty()) return List.of();
        return jdbc.sql("SELECT * FROM ruta WHERE ruta_id IN (:ids)")
                .param("ids", rutaIds)
                .query(this::fila)
                .list();
    }

    private Ruta fila(ResultSet rs, int i) throws SQLException {
        return new Ruta(
                rs.getObject("ruta_id", UUID.class),
                rs.getString("nombre"),
                new Lugar(
                        rs.getString("origen_nombre"),
                        new Coordenadas(rs.getDouble("origen_lat"), rs.getDouble("origen_lng"))),
                new Lugar(
                        rs.getString("destino_nombre"),
                        new Coordenadas(rs.getDouble("destino_lat"), rs.getDouble("destino_lng"))),
                rs.getInt("radio_metros"),
                rs.getBigDecimal("distancia_km"),
                rs.getBoolean("activa"),
                rs.getInt("version_agregado"));
    }
}
