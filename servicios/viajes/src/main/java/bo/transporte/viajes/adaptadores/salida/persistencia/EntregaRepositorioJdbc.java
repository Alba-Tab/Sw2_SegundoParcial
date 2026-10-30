package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.puerto.salida.EntregaRepositorio;
import bo.transporte.viajes.dominio.viaje.Entrega;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
class EntregaRepositorioJdbc implements EntregaRepositorio {
    private final JdbcClient jdbc;

    EntregaRepositorioJdbc(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<Entrega> delViaje(UUID viajeId) {
        return jdbc.sql("SELECT * FROM entrega WHERE viaje_id = :id")
                .param("id", viajeId)
                .query((rs, i) -> fila(rs))
                .optional();
    }

    @Override
    public void insertar(Entrega e) {
        jdbc.sql("""
                        INSERT INTO entrega (entrega_id, viaje_id, tipo, registrada_en, lat, lng, precision_metros,
                            distancia_metros, dentro_geocerca, con_firma, razones, nombre_receptor, firma_evidencia_id,
                            fotos, observacion, motivo)
                        VALUES (:id, :viaje, :tipo, :en, :lat, :lng, :precision, :distancia, :dentro, :conFirma,
                            CAST(:razones AS varchar(20)[]), :receptor, :firma, CAST(:fotos AS uuid[]), :observacion, :motivo)""")
                .param("id", e.entregaId())
                .param("viaje", e.viajeId())
                .param("tipo", e.tipo().name())
                .param("en", Timestamp.from(e.registradaEn()))
                .param("lat", e.lat())
                .param("lng", e.lng())
                .param("precision", e.precisionMetros())
                .param("distancia", e.distanciaMetros())
                .param("dentro", e.dentroGeocerca())
                .param("conFirma", e.conFirma())
                .param("razones", "{" + String.join(",", e.razones()) + "}")
                .param("receptor", e.nombreReceptor())
                .param("firma", e.firmaEvidenciaId())
                .param(
                        "fotos",
                        "{"
                                + String.join(
                                        ",",
                                        e.fotos().stream().map(UUID::toString).toList()) + "}")
                .param("observacion", e.observacion())
                .param("motivo", e.motivo())
                .update();
    }

    @Override
    public void guardarDecision(Entrega e) {
        jdbc.sql(
                        "UPDATE entrega SET decision = :decision, decidida_por = :por, motivo = :motivo WHERE entrega_id = :id")
                .param("decision", e.decision())
                .param("por", e.decididaPor())
                .param("motivo", e.motivo())
                .param("id", e.entregaId())
                .update();
    }

    private static Entrega fila(ResultSet rs) throws SQLException {
        return new Entrega(
                rs.getObject("entrega_id", UUID.class),
                rs.getObject("viaje_id", UUID.class),
                Entrega.Tipo.valueOf(rs.getString("tipo")),
                rs.getTimestamp("registrada_en").toInstant(),
                rs.getDouble("lat"),
                rs.getDouble("lng"),
                (Double) rs.getObject("precision_metros"),
                rs.getDouble("distancia_metros"),
                rs.getBoolean("dentro_geocerca"),
                rs.getBoolean("con_firma"),
                lista(rs.getArray("razones"), String.class),
                rs.getString("nombre_receptor"),
                rs.getObject("firma_evidencia_id", UUID.class),
                lista(rs.getArray("fotos"), UUID.class),
                rs.getString("observacion"),
                rs.getString("motivo"),
                rs.getString("decision"),
                rs.getString("decidida_por"));
    }

    private static <T> List<T> lista(Array a, Class<T> tipo) throws SQLException {
        return a == null
                ? List.of()
                : Arrays.stream((Object[]) a.getArray()).map(tipo::cast).toList();
    }
}
