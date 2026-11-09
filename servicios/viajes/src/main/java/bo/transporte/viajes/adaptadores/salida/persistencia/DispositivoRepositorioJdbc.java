package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.puerto.salida.DispositivoRepositorio;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
class DispositivoRepositorioJdbc implements DispositivoRepositorio {
    private final JdbcClient jdbc;

    DispositivoRepositorioJdbc(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void guardar(Dispositivo d) {
        jdbc.sql("""
                        INSERT INTO dispositivo (dispositivo_id, usuario_sub, plataforma, token_push, actualizado_en)
                        VALUES (:id, :sub, :plataforma, :token, :actualizadoEn)
                        ON CONFLICT (dispositivo_id) DO UPDATE
                           SET usuario_sub = EXCLUDED.usuario_sub, plataforma = EXCLUDED.plataforma,
                               token_push = EXCLUDED.token_push, actualizado_en = EXCLUDED.actualizado_en""")
                .param("id", d.dispositivoId())
                .param("sub", d.usuarioSub())
                .param("plataforma", d.plataforma().name())
                .param("token", d.tokenPush())
                .param("actualizadoEn", Timestamp.from(d.actualizadoEn()))
                .update();
    }

    @Override
    public Optional<Dispositivo> porId(UUID dispositivoId) {
        return jdbc.sql("SELECT * FROM dispositivo WHERE dispositivo_id = :id")
                .param("id", dispositivoId)
                .query((rs, i) -> new Dispositivo(
                        rs.getObject("dispositivo_id", UUID.class),
                        rs.getString("usuario_sub"),
                        Plataforma.valueOf(rs.getString("plataforma")),
                        rs.getString("token_push"),
                        rs.getTimestamp("actualizado_en").toInstant()))
                .optional();
    }

    @Override
    public List<String> tokensPush(String usuarioSub) {
        return jdbc.sql("SELECT token_push FROM dispositivo WHERE usuario_sub = :sub AND plataforma = 'ANDROID'"
                        + " AND token_push IS NOT NULL")
                .param("sub", usuarioSub)
                .query(String.class)
                .list();
    }

    @Override
    public void olvidarToken(String tokenPush) {
        jdbc.sql("UPDATE dispositivo SET token_push = NULL WHERE token_push = :token")
                .param("token", tokenPush)
                .update();
    }

    @Override
    public boolean registrarAviso(UUID eventoId, String tipo, String resultado) {
        return jdbc.sql("INSERT INTO notificacion_push (evento_id, tipo, resultado) VALUES (:id, :tipo, :resultado)"
                                + " ON CONFLICT (evento_id) DO NOTHING")
                        .param("id", eventoId)
                        .param("tipo", tipo)
                        .param("resultado", resultado)
                        .update()
                == 1;
    }

    @Override
    public void actualizarAviso(UUID eventoId, String resultado) {
        jdbc.sql("UPDATE notificacion_push SET resultado = :resultado WHERE evento_id = :id")
                .param("id", eventoId)
                .param("resultado", resultado)
                .update();
    }
}
