package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.cliente.AltaDeCliente;
import bo.transporte.viajes.aplicacion.cliente.ClienteVista;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente;
import bo.transporte.viajes.aplicacion.servicio.CancelacionDeServicio;
import bo.transporte.viajes.aplicacion.servicio.ConfirmacionDeServicio;
import bo.transporte.viajes.aplicacion.servicio.ServicioAceptado;
import bo.transporte.viajes.aplicacion.servicio.ServicioVista;
import bo.transporte.viajes.aplicacion.viaje.BitacoraDeRuta;
import bo.transporte.viajes.aplicacion.viaje.EntregaDeViaje;
import bo.transporte.viajes.aplicacion.viaje.InicioDeViaje;
import bo.transporte.viajes.aplicacion.viaje.ResultadoEntrega;
import bo.transporte.viajes.aplicacion.viaje.ViajeVista;
import bo.transporte.viajes.dominio.viaje.EventoConduccion;
import bo.transporte.viajes.dominio.viaje.Hito;
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
    private static final Map<String, Class<?>> RESPUESTAS = Map.ofEntries(
            Map.entry(EntregaDeViaje.ENTREGAR, ResultadoEntrega.class),
            Map.entry(EntregaDeViaje.RECHAZO_RECEPTOR, ResultadoEntrega.class),
            Map.entry(EntregaDeViaje.APROBAR, ViajeVista.class),
            Map.entry(EntregaDeViaje.RECHAZAR, ViajeVista.class),
            Map.entry(AltaDeCliente.OPERACION, ClienteVista.class),
            Map.entry(ConfirmacionDeServicio.OPERACION, ServicioAceptado.class),
            Map.entry(CancelacionDeServicio.OPERACION, ServicioVista.class),
            Map.entry(InicioDeViaje.OPERACION, ViajeVista.class),
            Map.entry(BitacoraDeRuta.HITO, Hito.class),
            Map.entry(BitacoraDeRuta.EVENTO, EventoConduccion.class));

    private final JdbcClient jdbc;
    private final JsonMapper json;

    RegistroIdempotenteJdbc(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<Operacion> buscar(UUID clave) {
        // Serializa las peticiones con la misma clave: el FOR UPDATE no bloquea una fila que todavía no existe, y la
        // segunda petición vería el estado nuevo (409) en vez de la respuesta guardada. Se libera con la transacción.
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:clave, 0))")
                .param("clave", clave.toString())
                .query(Object.class)
                .single();
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
        insertar(clave, tipo, hashCuerpo, "COMPLETADA", codigoHttp, respuesta);
    }

    private void insertar(UUID clave, String tipo, String hashCuerpo, String estado, int codigoHttp, Object respuesta) {
        try {
            jdbc.sql(
                            "INSERT INTO operacion_idempotente (clave, tipo_operacion, hash_cuerpo, estado, codigo_http, cuerpo_respuesta)"
                                    + " VALUES (:clave, :tipo, :hash, :estado, :codigo, CAST(:cuerpo AS jsonb))")
                    .param("clave", clave)
                    .param("tipo", tipo)
                    .param("hash", hashCuerpo)
                    .param("estado", estado)
                    .param("codigo", codigoHttp)
                    .param("cuerpo", json.writeValueAsString(respuesta))
                    .update();
        } catch (DuplicateKeyException e) {
            throw new ClaveRepetida(clave);
        }
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void guardarEnProceso(UUID clave, String tipo, String hashCuerpo, int codigoHttp, Object respuesta) {
        insertar(clave, tipo, hashCuerpo, "EN_PROCESO", codigoHttp, respuesta);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void completar(UUID clave) {
        jdbc.sql("UPDATE operacion_idempotente SET estado = 'COMPLETADA', actualizada_en = now() WHERE clave = :clave")
                .param("clave", clave)
                .update();
    }
}
