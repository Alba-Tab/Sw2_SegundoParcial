package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.puerto.salida.UltimaPosicionRepositorio;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
class UltimaPosicionRepositorioJdbc implements UltimaPosicionRepositorio {
    private final JdbcClient jdbc;

    UltimaPosicionRepositorioJdbc(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Un solo UPSERT: solo pisa la fila si el punto es más nuevo, así un lote atrasado o reenviado no la mueve. */
    @Override
    public boolean avanzar(UUID viajeId, UUID dispositivoId, UltimaPosicion p) {
        return jdbc.sql("""
                        INSERT INTO ultima_posicion (viaje_id, lat, lng, velocidad_kmh, registrada_en, dispositivo_id)
                        VALUES (:viaje, :lat, :lng, :velocidad, :registradaEn, :dispositivo)
                        ON CONFLICT (viaje_id) DO UPDATE
                           SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, velocidad_kmh = EXCLUDED.velocidad_kmh,
                               registrada_en = EXCLUDED.registrada_en, dispositivo_id = EXCLUDED.dispositivo_id,
                               actualizada_en = now()
                         WHERE ultima_posicion.registrada_en < EXCLUDED.registrada_en""")
                        .param("viaje", viajeId)
                        .param("lat", p.lat())
                        .param("lng", p.lng())
                        .param("velocidad", p.velocidadKmh())
                        .param("registradaEn", Timestamp.from(p.registradaEn()))
                        .param("dispositivo", dispositivoId)
                        .update()
                == 1;
    }

    @Override
    public Optional<UltimaPosicion> de(UUID viajeId) {
        return jdbc.sql("SELECT * FROM ultima_posicion WHERE viaje_id = :viaje")
                .param("viaje", viajeId)
                .query((rs, i) -> posicion(rs))
                .optional();
    }

    @Override
    public Map<UUID, UltimaPosicion> de(Collection<UUID> viajes) {
        Map<UUID, UltimaPosicion> r = new HashMap<>();
        if (viajes.isEmpty()) return r;
        jdbc.sql("SELECT * FROM ultima_posicion WHERE viaje_id IN (:viajes)")
                .param("viajes", viajes)
                .query(rs -> {
                    r.put(rs.getObject("viaje_id", UUID.class), posicion(rs));
                });
        return r;
    }

    private static UltimaPosicion posicion(ResultSet rs) throws SQLException {
        return new UltimaPosicion(
                rs.getDouble("lat"),
                rs.getDouble("lng"),
                rs.getBigDecimal("velocidad_kmh").doubleValue(),
                rs.getTimestamp("registrada_en").toInstant());
    }
}
