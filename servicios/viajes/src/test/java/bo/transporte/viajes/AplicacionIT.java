package bo.transporte.viajes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import bo.transporte.viajes.adaptadores.salida.persistencia.SemillaJdbc;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroDeEventos;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Sin OIDC_ISSUER (P10): salud, 503 en negocio, Problem Details con correlación, Flyway y el relay del Outbox. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "seguridad.issuer=")
@Import(TestcontainersConfiguration.class)
class AplicacionIT {
    @LocalServerPort
    int puerto;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    RegistroDeEventos registro;

    @Autowired
    TransactionTemplate tx;

    @Autowired
    SemillaJdbc semilla;

    @Autowired
    RabbitTemplate rabbit;

    @Autowired
    RabbitAdmin admin;

    @Autowired
    JsonMapper json;

    private final HttpClient http = HttpClient.newHttpClient();

    private HttpResponse<String> get(String ruta, String... encabezados) throws Exception {
        var b = HttpRequest.newBuilder(URI.create("http://localhost:" + puerto + ruta));
        if (encabezados.length > 0) b.headers(encabezados);
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void saludNoDependeDeKeycloak() throws Exception {
        assertEquals("{\"estado\":\"UP\"}", get("/health").body());
        HttpResponse<String> listo = get("/health/ready");
        assertEquals(200, listo.statusCode());
        JsonNode cuerpo = json.readTree(listo.body());
        assertEquals("UP", cuerpo.get("dependencias").get("postgres").asString());
        assertEquals("UP", cuerpo.get("dependencias").get("rabbitmq").asString());
    }

    @Test
    void sinIssuerElNegocioResponde503ConProblemDetails() throws Exception {
        String correlacion = "0193a000-0000-7000-8000-00000000abcd";
        HttpResponse<String> r = get("/api/v1/servicios", "X-Correlation-Id", correlacion);
        assertEquals(503, r.statusCode());
        assertEquals(
                "application/problem+json",
                r.headers().firstValue("Content-Type").orElseThrow());
        assertEquals("30", r.headers().firstValue("Retry-After").orElseThrow());
        assertEquals(correlacion, r.headers().firstValue("X-Correlation-Id").orElseThrow());
        JsonNode p = json.readTree(r.body());
        assertEquals("DEPENDENCIA_NO_DISPONIBLE", p.get("codigo").asString());
        assertEquals(correlacion, p.get("correlationId").asString());
    }

    @Test
    void migracionCreaLasTablasComunes() {
        List<String> tablas = jdbc.sql("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
                .query(String.class)
                .list();
        assertTrue(
                tablas.containsAll(List.of("auditoria", "inbox_eventos", "operacion_idempotente", "outbox_eventos")),
                tablas.toString());
    }

    @Test
    void outboxSoloDentroDeUnaTransaccion() {
        assertThrows(
                IllegalTransactionStateException.class,
                () -> registro.registrar("ViajeConfirmado", "viajes.viaje-confirmado.v1", Map.of()));
    }

    @Test
    void elRelayPublicaElSobreConConfirmacion() throws Exception {
        TopicExchange exchange = new TopicExchange("transporte.events");
        Queue cola = new Queue("prueba.viajes", false, true, true);
        admin.declareExchange(exchange);
        admin.declareQueue(cola);
        admin.declareBinding(BindingBuilder.bind(cola).to(exchange).with("viajes.#"));

        // Datos válidos según el contrato: el Outbox valida cada evento contra su esquema (000 §6).
        JsonNode ejemplo = json.readTree(
                        getClass().getResourceAsStream("/contratos/eventos/viajes/ViajeConfirmado.v1.schema.json"))
                .get("examples")
                .get(0)
                .get("datos");
        tx.executeWithoutResult(s -> registro.registrar(
                "ViajeConfirmado", "viajes.viaje-confirmado.v1", json.treeToValue(ejemplo, Map.class)));

        var mensaje = rabbit.receive("prueba.viajes", 10_000);
        assertNotNull(mensaje, "el relay no publicó");
        JsonNode sobre = json.readTree(mensaje.getBody());
        assertEquals("ViajeConfirmado", sobre.get("tipo").asString());
        assertEquals(1, sobre.get("version").asInt());
        assertEquals("viajes", sobre.get("productor").asString());
        assertEquals(ejemplo, sobre.get("datos"));
        assertEquals(sobre.get("id").asString(), mensaje.getMessageProperties().getMessageId());
        Thread.sleep(300);
        assertEquals(
                0L,
                jdbc.sql("SELECT count(*) FROM outbox_eventos WHERE publicado_en IS NULL")
                        .query(Long.class)
                        .single());
    }

    @Test
    void laSemillaCargaClientesYRutasSinEventosYEsIdempotente() throws Exception {
        semilla.cargar(Path.of("../../plataforma/semilla"));
        int[] n = semilla.cargar(Path.of("../../plataforma/semilla"));
        assertEquals(3, n[0]);
        assertEquals(4, n[1]);
        assertEquals(
                "Agro Moroso",
                jdbc.sql("SELECT razon_social FROM cliente WHERE cliente_id = '0193a000-0000-7000-8000-0000000c0002'")
                        .query(String.class)
                        .single());
        assertEquals(
                false,
                jdbc.sql("SELECT vinculado FROM cliente WHERE cliente_id = '0193a000-0000-7000-8000-0000000c0003'")
                        .query(Boolean.class)
                        .single());
        assertEquals(
                120,
                jdbc.sql("SELECT distancia_km FROM ruta WHERE ruta_id = '01933a00-0000-7000-8000-000000000004'")
                        .query(Integer.class)
                        .single());
        assertEquals(
                0,
                jdbc.sql("SELECT count(*) FROM outbox_eventos WHERE tipo IN ('ClienteActualizado', 'RutaActualizada')")
                        .query(Integer.class)
                        .single());
    }
}
