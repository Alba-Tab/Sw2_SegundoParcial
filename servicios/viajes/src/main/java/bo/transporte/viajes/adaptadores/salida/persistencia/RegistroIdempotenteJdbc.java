package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.cliente.AltaDeCliente;
import bo.transporte.viajes.aplicacion.cliente.ClienteVista;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/** operacion_idempotente (000 §4.1). La respuesta se guarda en JSON y se lee con el tipo de cada operación. */
@Component
class RegistroIdempotenteJdbc implements RegistroIdempotente {
    /** Tipo de la respuesta guardada por operación. */
    private static final Map<String, Class<?>> RESPUESTAS = Map.of(AltaDeCliente.OPERACION, ClienteVista.class);

    private final JdbcClient jdbc;
    private final JsonMapper json;

    RegistroIdempotenteJdbc(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<Operacion> buscar(UUID clave) {
        return jdbc.sql(
                        "SELECT clave, tipo_operacion, hash_cuerpo, estado, codigo_http, cuerpo_respuesta::text AS cuerpo"
                                + " FROM operacion_idempotente WHERE clave = :clave FOR UPDATE")
                .param("clave", clave)
                .query((rs, i) -> {
                    String tipo = rs.getString("tipo_operacion");
                    String cuerpo = rs.getString("cuerpo");
                    Object respuesta =
                            cuerpo == null ? null : json.readValue(cuerpo, RESPUESTAS.getOrDefault(tipo, Object.class));
                    Integer codigo = rs.getObject("codigo_http") == null ? null : rs.getInt("codigo_http");
                    return new Operacion(
                            rs.getObject("clave", UUID.class),
                            tipo,
                            rs.getString("hash_cuerpo"),
                            Estado.valueOf(rs.getString("estado")),
                            codigo,
                            respuesta);
                })
                .optional();
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void guardarCompletada(UUID clave, String tipo, String hashCuerpo, int codigoHttp, Object respuesta) {
        try {
            jdbc.sql(
                            "INSERT INTO operacion_idempotente (clave, tipo_operacion, hash_cuerpo, estado, codigo_http, cuerpo_respuesta)"
                                    + " VALUES (:clave, :tipo, :hash, 'COMPLETADA', :codigo, CAST(:cuerpo AS jsonb))")
                    .param("clave", clave)
                    .param("tipo", tipo)
                    .param("hash", hashCuerpo)
                    .param("codigo", codigoHttp)
                    .param("cuerpo", json.writeValueAsString(respuesta))
                    .update();
        } catch (DuplicateKeyException e) {
            throw new ClaveRepetida(clave);
        }
    }
}
