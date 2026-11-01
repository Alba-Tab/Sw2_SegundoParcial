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
    public List<Ruta> todas() {
        return jdbc.sql("SELECT * FROM ruta ORDER BY nombre").query(this::fila).list();
    }

    @Override
    public Optional<Ruta> paraActualizar(UUID rutaId) {
        return jdbc.sql("SELECT * FROM ruta WHERE ruta_id = :id FOR UPDATE")
                .param("id", rutaId)
                .query(this::fila)
                .optional();
    }

    @Override
    public void guardar(Ruta r) {
        jdbc.sql("""
                        INSERT INTO ruta (ruta_id, nombre, origen_nombre, origen_lat, origen_lng, destino_nombre, destino_lat,
                                          destino_lng, radio_metros, distancia_km, activa, version_agregado)
                        VALUES (:id, :nombre, :origen, :origenLat, :origenLng, :destino, :destinoLat, :destinoLng, :radio,
                                :km, :activa, :version)
                        ON CONFLICT (ruta_id) DO UPDATE SET nombre = EXCLUDED.nombre, origen_nombre = EXCLUDED.origen_nombre,
                            origen_lat = EXCLUDED.origen_lat, origen_lng = EXCLUDED.origen_lng,
                            destino_nombre = EXCLUDED.destino_nombre, destino_lat = EXCLUDED.destino_lat,
                            destino_lng = EXCLUDED.destino_lng, radio_metros = EXCLUDED.radio_metros,
                            distancia_km = EXCLUDED.distancia_km, activa = EXCLUDED.activa,
                            version_agregado = EXCLUDED.version_agregado""")
                .param("id", r.rutaId())
                .param("nombre", r.nombre())
                .param("origen", r.origen().nombre())
                .param("origenLat", r.origen().coordenadas().lat())
                .param("origenLng", r.origen().coordenadas().lng())
                .param("destino", r.destino().nombre())
                .param("destinoLat", r.destino().coordenadas().lat())
                .param("destinoLng", r.destino().coordenadas().lng())
                .param("radio", r.radioMetros())
                .param("km", r.distanciaKm())
                .param("activa", r.activa())
                .param("version", r.versionAgregado())
                .update();
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
