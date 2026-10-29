package bo.transporte.viajes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

import bo.transporte.viajes.aplicacion.puerto.salida.VinculadorIdentidad;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Spec 001 (alta de cliente) y lecturas de clientes y rutas, con Keycloak simulado. */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"seguridad.issuer=http://localhost:1/realms/transporte", "outbox.intervalo=PT1H"})
@Import({TestcontainersConfiguration.class, TokensDePrueba.class})
class ClientesIT {
    @LocalServerPort
    int puerto;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    JsonMapper json;

    @MockitoBean
    VinculadorIdentidad identidad;

    private final HttpClient http = HttpClient.newHttpClient();

    record Respuesta(int estado, JsonNode cuerpo, HttpResponse<String> cruda) {}

    @BeforeEach
    void limpiar() {
        jdbc.sql("TRUNCATE cliente, ruta, operacion_idempotente, outbox_eventos, auditoria")
                .update();
        reset(identidad);
    }

    private Respuesta pedir(String metodo, String ruta, String token, UUID clave, String cuerpo) throws Exception {
        var b = HttpRequest.newBuilder(URI.create("http://localhost:" + puerto + ruta))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .method(
                        metodo,
                        cuerpo == null
                                ? HttpRequest.BodyPublishers.noBody()
                                : HttpRequest.BodyPublishers.ofString(cuerpo));
        if (clave != null) b.header("Idempotency-Key", clave.toString());
        var r = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
        return new Respuesta(r.statusCode(), r.body().isBlank() ? null : json.readTree(r.body()), r);
    }

    private static String empresa(String nit) {
        return """
                {"razonSocial":"Agroexport SRL","nit":"%s","correo":"cobranzas@agroexport.example",
                 "telefono":"+59133456789","direccion":"Av. Banzer km 7, Santa Cruz"}""".formatted(nit);
    }

    private static final String NUEVO = TokensDePrueba.token("sub-nuevo", "", null);

    @Test
    void altaDesdeElPortalVinculaEnKeycloakYPublicaElEvento() throws Exception {
        var r = pedir("POST", "/api/v1/clientes", NUEVO, UUID.randomUUID(), empresa("1023456019"));
        assertEquals(201, r.estado());
        String id = r.cuerpo().get("clienteId").asString();
        assertEquals(
                "/api/v1/clientes/" + id,
                r.cruda().headers().firstValue("Location").orElseThrow());
        assertEquals("PORTAL", r.cuerpo().get("canal").asString());
        assertTrue(r.cuerpo().get("tieneCuenta").asBoolean());
        assertTrue(r.cuerpo().get("vinculado").asBoolean());
        verify(identidad).vincular("sub-nuevo", UUID.fromString(id));

        JsonNode sobre = json.readTree(jdbc.sql("SELECT sobre::text FROM outbox_eventos")
                .query(String.class)
                .single());
        assertEquals("ClienteActualizado", sobre.get("tipo").asString());
        assertEquals(id, sobre.get("datos").get("clienteId").asString());
        assertEquals(1, sobre.get("datos").get("versionAgregado").asInt());
        assertNotNull(sobre.get("traceparent"));
        assertEquals(
                "CREAR_CLIENTE",
                jdbc.sql("SELECT accion FROM auditoria").query(String.class).single());
    }

    @Test
    void reenvioConLaMismaClaveDevuelveLaRespuestaGuardadaYOtroCuerpoDa422() throws Exception {
        UUID clave = UUID.randomUUID();
        var primera = pedir("POST", "/api/v1/clientes", NUEVO, clave, empresa("1023456019"));
        var segunda = pedir("POST", "/api/v1/clientes", NUEVO, clave, empresa("1023456019"));
        assertEquals(201, segunda.estado());
        assertEquals(primera.cuerpo().get("clienteId"), segunda.cuerpo().get("clienteId"));
        assertFalse(segunda.cuerpo().get("vinculado").asBoolean(), "la respuesta guardada es la de antes del vínculo");
        assertEquals(
                1L, jdbc.sql("SELECT count(*) FROM cliente").query(Long.class).single());

        var otroCuerpo = pedir("POST", "/api/v1/clientes", NUEVO, clave, empresa("9999999"));
        assertEquals(422, otroCuerpo.estado());
        assertEquals(
                "IDEMPOTENCIA_CUERPO_DISTINTO",
                otroCuerpo.cuerpo().get("codigo").asString());
    }

    @Test
    void unUsuarioTieneUnSoloClienteYElNitEsUnico() throws Exception {
        var primera = pedir("POST", "/api/v1/clientes", NUEVO, UUID.randomUUID(), empresa("1023456019"));
        var otraClave = pedir("POST", "/api/v1/clientes", NUEVO, UUID.randomUUID(), empresa("5555555"));
        assertEquals(409, otraClave.estado());
        assertEquals("CONFLICTO_ESTADO", otraClave.cuerpo().get("codigo").asString());
        assertEquals(primera.cuerpo().get("clienteId"), otraClave.cuerpo().get("clienteId"));

        var mismoNit = pedir(
                "POST",
                "/api/v1/clientes",
                TokensDePrueba.token("sub-otro", "", null),
                UUID.randomUUID(),
                empresa("1023456019"));
        assertEquals(409, mismoNit.estado());
    }

    @Test
    void conKeycloakCaidoQuedaSinVincularYSeReintenta() throws Exception {
        doThrow(new VinculadorIdentidad.IdentidadNoDisponible("caído", null))
                .when(identidad)
                .vincular(anyString(), any());
        var alta = pedir("POST", "/api/v1/clientes", NUEVO, UUID.randomUUID(), empresa("1023456019"));
        assertEquals(201, alta.estado());
        assertFalse(alta.cuerpo().get("vinculado").asBoolean());

        var sigueCaido = pedir("POST", "/api/v1/clientes/mio/vinculacion", NUEVO, UUID.randomUUID(), null);
        assertEquals(503, sigueCaido.estado());
        assertEquals("VINCULACION_PENDIENTE", sigueCaido.cuerpo().get("codigo").asString());
        assertTrue(sigueCaido.cruda().headers().firstValue("Retry-After").isPresent());

        doNothing().when(identidad).vincular(anyString(), any());
        var reintento = pedir("POST", "/api/v1/clientes/mio/vinculacion", NUEVO, UUID.randomUUID(), null);
        assertEquals(200, reintento.estado());
        assertTrue(reintento.cuerpo().get("vinculado").asBoolean());
        assertTrue(pedir("GET", "/api/v1/clientes/mio", NUEVO, null, null)
                .cuerpo()
                .get("vinculado")
                .asBoolean());
        assertEquals(
                1L, jdbc.sql("SELECT count(*) FROM cliente").query(Long.class).single());
    }

    @Test
    void comercialRegistraUnClienteSinCuentaYNoTocaKeycloak() throws Exception {
        var r = pedir(
                "POST",
                "/api/v1/clientes",
                TokensDePrueba.token("sub-comercial", "comercial", null),
                UUID.randomUUID(),
                empresa("1023456019"));
        assertEquals(201, r.estado());
        assertEquals("TELEFONO", r.cuerpo().get("canal").asString());
        assertFalse(r.cuerpo().get("tieneCuenta").asBoolean());
        assertEquals("sub-comercial", r.cuerpo().get("creadoPor").asString());
        verify(identidad, never()).vincular(anyString(), any());
        assertEquals(
                "TELEFONO",
                jdbc.sql("SELECT canal FROM auditoria").query(String.class).single());
    }

    @Test
    void validacionPermisosYEncabezados() throws Exception {
        assertEquals(
                403,
                pedir(
                                "POST",
                                "/api/v1/clientes",
                                TokensDePrueba.token("sub-chofer", "chofer", null),
                                UUID.randomUUID(),
                                empresa("1023456019"))
                        .estado());

        var nitMalo = pedir("POST", "/api/v1/clientes", NUEVO, UUID.randomUUID(), empresa("12a"));
        assertEquals(400, nitMalo.estado());
        assertEquals("VALIDACION", nitMalo.cuerpo().get("codigo").asString());

        var sinClave = pedir("POST", "/api/v1/clientes", NUEVO, null, empresa("1023456019"));
        assertEquals(400, sinClave.estado());
        assertEquals("VALIDACION", sinClave.cuerpo().get("codigo").asString());
    }

    @Test
    void lecturasDeClientesConPermisosYPaginacion() throws Exception {
        String comercial = TokensDePrueba.token("sub-comercial", "comercial", null);
        for (int i = 0; i < 3; i++) {
            pedir("POST", "/api/v1/clientes", comercial, UUID.randomUUID(), empresa("100000" + i));
        }
        var primera = pedir("GET", "/api/v1/clientes?limite=2", comercial, null, null);
        assertEquals(2, primera.cuerpo().get("items").size());
        String cursor = primera.cuerpo().get("siguienteCursor").asString();
        var segunda = pedir("GET", "/api/v1/clientes?limite=2&cursor=" + cursor, comercial, null, null);
        assertEquals(1, segunda.cuerpo().get("items").size());
        assertTrue(segunda.cuerpo().get("siguienteCursor").isNull());
        assertEquals(
                400,
                pedir("GET", "/api/v1/clientes?limite=500", comercial, null, null)
                        .estado());

        String propio = primera.cuerpo().get("items").get(0).get("clienteId").asString();
        String ajeno = primera.cuerpo().get("items").get(1).get("clienteId").asString();
        String cliente = TokensDePrueba.token("sub-cliente", "cliente", propio);
        assertEquals(403, pedir("GET", "/api/v1/clientes", cliente, null, null).estado());
        assertEquals(
                200,
                pedir("GET", "/api/v1/clientes/" + propio, cliente, null, null).estado());
        assertEquals(
                403,
                pedir("GET", "/api/v1/clientes/" + ajeno, cliente, null, null).estado());
        assertEquals(
                404, pedir("GET", "/api/v1/clientes/mio", NUEVO, null, null).estado());
    }

    @Test
    void rutasActivasParaCualquierUsuarioAutenticado() throws Exception {
        jdbc.sql("""
                INSERT INTO ruta VALUES ('01933a00-0000-7000-8000-000000000004', 'Aula', 'Santa Cruz', -17.7833, -63.1821,
                  'Lugar de la defensa', -17.7766, -63.1949, 300, 120.0, true, 1),
                 ('01933a00-0000-7000-8000-000000000009', 'Vieja', 'A', 0, 0, 'B', 0, 0, 300, 10, false, 1)""").update();
        var r = pedir("GET", "/api/v1/rutas", TokensDePrueba.token("sub-chofer", "chofer", null), null, null);
        assertEquals(200, r.estado());
        assertEquals(1, r.cuerpo().size());
        assertEquals(300, r.cuerpo().get(0).get("destino").get("radioMetros").asInt());
        assertEquals(
                0,
                new java.math.BigDecimal("120.0")
                        .compareTo(r.cuerpo().get(0).get("distanciaKm").decimalValue()));
        assertEquals(
                404,
                pedir("GET", "/api/v1/rutas/" + UUID.randomUUID(), NUEVO, null, null)
                        .estado());
    }
}
