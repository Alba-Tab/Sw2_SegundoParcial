package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.puerto.salida.BitacoraRepositorio;
import bo.transporte.viajes.dominio.viaje.EventoConduccion;
import bo.transporte.viajes.dominio.viaje.Hito;
import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
class BitacoraRepositorioJdbc implements BitacoraRepositorio {
    private final JdbcClient jdbc;

    BitacoraRepositorioJdbc(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean insertarHito(Hito h) {
        return jdbc.sql("""
                        INSERT INTO hito (hito_id, viaje_id, tipo, descripcion, lat, lng, registrado_en, origen)
                        VALUES (:id, :viaje, :tipo, :descripcion, :lat, :lng, :registradoEn, :origen)
                        ON CONFLICT (hito_id) DO NOTHING""")
                        .param("id", h.hitoId())
                        .param("viaje", h.viajeId())
                        .param("tipo", h.tipo().name())
                        .param("descripcion", h.descripcion())
                        .param("lat", h.lat())
                        .param("lng", h.lng())
                        .param("registradoEn", Timestamp.from(h.registradoEn()))
                        .param("origen", h.origen().name())
                        .update()
                == 1;
    }

    /** El texto se busca con ILIKE escapando {@code %}, {@code _} y la barra (spec 014). */
    @Override
    public List<Hito> hitos(UUID viajeId, String texto, int limite) {
        String filtro = texto == null ? "" : " AND descripcion ILIKE :patron ESCAPE '\\'";
        var consulta = jdbc.sql("SELECT * FROM hito WHERE viaje_id = :viaje" + filtro
                        + " ORDER BY registrado_en DESC, hito_id LIMIT :limite")
                .param("viaje", viajeId)
                .param("limite", limite);
        if (texto != null) {
            String escapado = texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
            consulta = consulta.param("patron", "%" + escapado + "%");
        }
        return consulta.query((rs, i) -> new Hito(
                        rs.getObject("hito_id", UUID.class),
                        rs.getObject("viaje_id", UUID.class),
                        Hito.Tipo.valueOf(rs.getString("tipo")),
                        rs.getString("descripcion"),
                        rs.getDouble("lat"),
                        rs.getDouble("lng"),
                        rs.getTimestamp("registrado_en").toInstant(),
                        Hito.Origen.valueOf(rs.getString("origen"))))
                .list();
    }

    @Override
    public boolean insertarEvento(EventoConduccion e) {
        return jdbc.sql("""
                        INSERT INTO evento_conduccion (evento_id, viaje_id, tipo, magnitud_g, lat, lng, registrado_en)
                        VALUES (:id, :viaje, :tipo, :magnitud, :lat, :lng, :registradoEn)
                        ON CONFLICT (evento_id) DO NOTHING""")
                        .param("id", e.eventoId())
                        .param("viaje", e.viajeId())
                        .param("tipo", e.tipo().name())
                        .param("magnitud", e.magnitudG())
                        .param("lat", e.lat())
                        .param("lng", e.lng())
                        .param("registradoEn", Timestamp.from(e.registradoEn()))
                        .update()
                == 1;
    }
}
