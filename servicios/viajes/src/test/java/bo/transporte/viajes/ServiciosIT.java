package bo.transporte.viajes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import bo.transporte.viajes.TemporalDePrueba.FinanzasFalsa;
import bo.transporte.viajes.TemporalDePrueba.FlotaFalsa;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.DetalleFallo;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ValidarYReservarCreditoResultado;
import io.temporal.failure.ApplicationFailure;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.function.Predicate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Spec 003 de punta a punta en Viajes: la API, el worker real de la cola viajes y dobles de Finanzas y Flota. */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "seguridad.issuer=http://localhost:1/realms/transporte",
            "outbox.intervalo=PT1H",
            "saga.compensacion.maximo-intentos=2"
        })
@Import({TestcontainersConfiguration.class, TokensDePrueba.class})
class ServiciosIT {
    static final String CLIENTE = "01933b5a-1f00-7a20-8b11-0c2d3e4f5a01";
    static final String OTRO_CLIENTE = "01933b5a-1f00-7a20-8b11-0c2d3e4f5a02";
    static final String COTIZACION = "01933b6e-4c2a-7d10-9a3e-5f1c2b7a8d03";

    @LocalServerPort
    int puerto;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    JsonMapper json;

    @Autowired
    FinanzasFalsa finanzas;

    @Autowired
    FlotaFalsa flota;

    private final HttpClient http = HttpClient.newHttpClient();

    record Respuesta(int estado, JsonNode cuerpo, HttpResponse<String> cruda) {}

    @BeforeEach
    void preparar() {
        jdbc.sql("TRUNCATE viaje, servicio, cliente, ruta, operacion_idempotente, outbox_eventos, auditoria")
                .update();
        for (String id : List.of(CLIENTE, OTRO_CLIENTE)) {
            jdbc.sql("""
                            INSERT INTO cliente (cliente_id, sub, razon_social, nit, correo, telefono, direccion, canal,
                                                 vinculado, creado_por, creado_en, version_agregado, activo)
                            VALUES (CAST(:id AS uuid), :id, 'Agroexport SRL', :nit, 'c@agro.example', '+59133456789',
                                    'Av. Banzer km 7', 'PORTAL', true, :id, now(), 1, true)""")
                    .param("id", id)
                    .param("nit", "102345" + id.substring(id.length() - 2))
                    .update();
        }
        jdbc.sql("""
                        INSERT INTO ruta (ruta_id, nombre, origen_nombre, origen_lat, origen_lng, destino_nombre,
                                          destino_lat, destino_lng, radio_metros, distancia_km, activa, version_agregado)
                        VALUES (:id, 'Aula', 'Santa Cruz', -17.78, -63.18, 'Aula', -17.80, -63.20, 300, 12, true, 1)""").param("id", TemporalDePrueba.RUTA_AULA).update();
        finanzas.respuesta = FinanzasFalsa::reservado;
        flota.respuesta = FlotaFalsa::reservada;
        finanzas.llamadas.clear();
        flota.llamadas.clear();
        finanzas.alLiberar = () -> {};
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

    private static String cliente(String clienteId) {
        return TokensDePrueba.token("sub-" + clienteId.substring(30), "cliente", clienteId);
    }

    private Respuesta confirmar(String token, String cuerpo) throws Exception {
        return pedir("POST", "/api/v1/servicios", token, UUID.randomUUID(), cuerpo);
    }

    private JsonNode esperar(String servicioId, Predicate<JsonNode> condicion) throws Exception {
        for (int i = 0; i < 100; i++) {
            var r = pedir(
                    "GET",
                    "/api/v1/servicios/" + servicioId,
                    TokensDePrueba.token("d", "despachador", null),
                    null,
                    null);
            if (r.estado() == 200 && condicion.test(r.cuerpo())) return r.cuerpo();
            Thread.sleep(100);
        }
        throw new AssertionError("El servicio " + servicioId + " no llegó al estado esperado");
    }

    private JsonNode sobre(String tipo) {
        return json.readTree(jdbc.sql("SELECT sobre::text FROM outbox_eventos WHERE tipo = :tipo")
                .param("tipo", tipo)
                .query(String.class)
                .single());
    }

    @Test
    void confirmaYLlegaAConfirmadoConPlacaChoferYEvento() throws Exception {
        var r = confirmar(cliente(CLIENTE), "{\"cotizacionId\":\"" + COTIZACION + "\"}");
        assertEquals(202, r.estado());
        String servicioId = r.cuerpo().get("servicioId").asString();
        assertEquals("PROGRAMANDO", r.cuerpo().get("estado").asString());
        assertEquals(
                "/api/v1/servicios/" + servicioId,
                r.cruda().headers().firstValue("Location").orElseThrow());

        JsonNode s = esperar(servicioId, c -> c.get("confirmacionCompleta").asBoolean());
        assertEquals("CONFIRMADO", s.get("estado").asString());
        assertEquals("4521KTR", s.get("placa").asString());
        assertEquals("Juan Mamani", s.get("choferNombre").asString());
        assertEquals("2800.00", s.get("monto").get("monto").asString());
        assertEquals("PORTAL", s.get("canal").asString());
        assertFalse(s.has("etapa"));

        JsonNode datos = sobre("ViajeConfirmado").get("datos");
        assertEquals(servicioId, datos.get("servicioId").asString());
        assertEquals(CLIENTE, datos.get("clienteId").asString());
        assertEquals(28, datos.get("toneladas").asInt());
    }

    @Test
    void unErrorDeNegocioCancelaConSuMotivoYPublicaViajeCancelado() throws Exception {
        finanzas.respuesta = e -> {
            throw ApplicationFailure.newNonRetryableFailure(
                    "Sin crédito",
                    "CREDITO_INSUFICIENTE",
                    new DetalleFallo("CREDITO_INSUFICIENTE", "Disponible 5000.00, monto 7600.00", null));
        };
        String servicioId = confirmar(cliente(CLIENTE), "{\"cotizacionId\":\"" + COTIZACION + "\"}")
                .cuerpo()
                .get("servicioId")
                .asString();
        JsonNode s = esperar(servicioId, c -> c.get("estado").asString().equals("CANCELADO"));
        assertEquals("CREDITO_INSUFICIENTE", s.get("motivo").asString());
        JsonNode datos = sobre("ViajeCancelado").get("datos");
        assertEquals("SAGA", datos.get("origen").asString());
        assertEquals("PROGRAMANDO", datos.get("estadoAnterior").asString());
        assertEquals("Disponible 5000.00, monto 7600.00", datos.get("detalle").asString());
    }

    @Test
    void dobleEnvioSimultaneoDevuelveElMismoServicioYUnSoloWorkflow() throws Exception {
        UUID clave = UUID.randomUUID();
        String cuerpo = "{\"cotizacionId\":\"" + COTIZACION + "\"}";
        var a = CompletableFuture.supplyAsync(() -> pedirSinExcepcion(clave, cuerpo));
        var b = CompletableFuture.supplyAsync(() -> pedirSinExcepcion(clave, cuerpo));
        Respuesta ra = a.get(), rb = b.get();
        assertEquals(202, ra.estado());
        assertEquals(202, rb.estado());
        assertEquals(ra.cuerpo().get("servicioId"), rb.cuerpo().get("servicioId"));
        assertEquals(
                1,
                jdbc.sql("SELECT count(*) FROM servicio").query(Integer.class).single());
        esperar(
                ra.cuerpo().get("servicioId").asString(),
                c -> c.get("confirmacionCompleta").asBoolean());
        assertEquals(1, finanzas.llamadas.size());

        var otroCuerpo = pedir(
                "POST",
                "/api/v1/servicios",
                cliente(CLIENTE),
                clave,
                "{\"cotizacionId\":\"" + UUID.randomUUID() + "\"}");
        assertEquals(422, otroCuerpo.estado());
        assertEquals(
                "IDEMPOTENCIA_CUERPO_DISTINTO",
                otroCuerpo.cuerpo().get("codigo").asString());
    }

    private Respuesta pedirSinExcepcion(UUID clave, String cuerpo) {
        try {
            return pedir("POST", "/api/v1/servicios", cliente(CLIENTE), clave, cuerpo);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void comercialConfirmaANombreDeUnClienteYSinClienteIdEs403() throws Exception {
        String comercial = TokensDePrueba.token("sub-comercial", "comercial", null);
        var sin = confirmar(comercial, "{\"cotizacionId\":\"" + COTIZACION + "\"}");
        assertEquals(403, sin.estado());
        assertEquals("SIN_PERMISO", sin.cuerpo().get("codigo").asString());

        var con = confirmar(comercial, "{\"cotizacionId\":\"" + COTIZACION + "\",\"clienteId\":\"" + CLIENTE + "\"}");
        assertEquals(202, con.estado(), String.valueOf(con.cuerpo()));
        JsonNode s = esperar(
                con.cuerpo().get("servicioId").asString(),
                c -> c.get("confirmacionCompleta").asBoolean());
        assertEquals("TELEFONO", s.get("canal").asString());
        assertEquals("sub-comercial", s.get("creadoPor").asString());
        assertEquals(CLIENTE, s.get("clienteId").asString());

        assertEquals(
                403,
                confirmar(
                                TokensDePrueba.token("sub-d", "despachador", null),
                                "{\"cotizacionId\":\"" + COTIZACION + "\"}")
                        .estado());
    }

    @Test
    void esperandoAprobacionMuestraLaEtapaYNoSePuedeCancelar() throws Exception {
        finanzas.respuesta = e -> {
            var r = FinanzasFalsa.reservado(e);
            return new ValidarYReservarCreditoResultado(
                    "REQUIERE_APROBACION",
                    r.reservaCreditoId(),
                    r.rutaId(),
                    r.tipoCarga(),
                    r.toneladas(),
                    r.fechaViaje(),
                    r.monto(),
                    List.of("MONTO_ALTO"));
        };
        String servicioId = confirmar(cliente(CLIENTE), "{\"cotizacionId\":\"" + COTIZACION + "\"}")
                .cuerpo()
                .get("servicioId")
                .asString();
        JsonNode s = esperar(
                servicioId, c -> c.has("etapa") && c.get("etapa").asString().equals("ESPERANDO_APROBACION"));
        assertEquals("PROGRAMANDO", s.get("estado").asString());

        var cancelar = pedir(
                "POST",
                "/api/v1/servicios/" + servicioId + "/cancelacion",
                cliente(CLIENTE),
                UUID.randomUUID(),
                "{\"motivo\":\"Cambio de fecha\"}");
        assertEquals(409, cancelar.estado());
        assertEquals("CONFIRMACION_EN_CURSO", cancelar.cuerpo().get("codigo").asString());
    }

    @Test
    void unClienteSoloVeYListaSusServicios() throws Exception {
        String servicioId = confirmar(cliente(CLIENTE), "{\"cotizacionId\":\"" + COTIZACION + "\"}")
                .cuerpo()
                .get("servicioId")
                .asString();
        esperar(servicioId, c -> c.get("confirmacionCompleta").asBoolean());

        var ajeno = pedir("GET", "/api/v1/servicios/" + servicioId, cliente(OTRO_CLIENTE), null, null);
        assertEquals(403, ajeno.estado());
        var listaAjena = pedir("GET", "/api/v1/servicios?clienteId=" + CLIENTE, cliente(OTRO_CLIENTE), null, null);
        assertEquals(200, listaAjena.estado(), String.valueOf(listaAjena.cuerpo()));
        assertEquals(0, listaAjena.cuerpo().get("items").size());

        var lista = pedir("GET", "/api/v1/servicios?estado=CONFIRMADO", cliente(CLIENTE), null, null);
        assertEquals(1, lista.cuerpo().get("items").size());
        assertTrue(lista.cuerpo().get("siguienteCursor").isNull());
        var gerente = pedir(
                "GET",
                "/api/v1/servicios?clienteId=" + CLIENTE,
                TokensDePrueba.token("g", "gerente", null),
                null,
                null);
        assertEquals(1, gerente.cuerpo().get("items").size());
        assertEquals(
                404,
                pedir("GET", "/api/v1/servicios/" + UUID.randomUUID(), cliente(CLIENTE), null, null)
                        .estado());
    }

    private String esperandoAprobacion() throws Exception {
        finanzas.respuesta = e -> {
            var r = FinanzasFalsa.reservado(e);
            return new ValidarYReservarCreditoResultado(
                    "REQUIERE_APROBACION",
                    r.reservaCreditoId(),
                    r.rutaId(),
                    r.tipoCarga(),
                    r.toneladas(),
                    r.fechaViaje(),
                    r.monto(),
                    List.of("MORA"));
        };
        String servicioId = confirmar(cliente(CLIENTE), "{\"cotizacionId\":\"" + COTIZACION + "\"}")
                .cuerpo()
                .get("servicioId")
                .asString();
        esperar(servicioId, c -> c.has("etapa") && c.get("etapa").asString().equals("ESPERANDO_APROBACION"));
        return servicioId;
    }

    @Test
    void administracionApruebaYElServicioSigueHastaConfirmar() throws Exception {
        String servicioId = esperandoAprobacion();
        String ruta = "/api/v1/servicios/" + servicioId + "/aprobacion-credito";
        String adm = TokensDePrueba.token("sub-adm", "administracion", null);

        assertEquals(
                403,
                pedir(
                                "POST",
                                ruta,
                                TokensDePrueba.token("c", "comercial", null),
                                UUID.randomUUID(),
                                "{\"aprobado\":true}")
                        .estado());
        var sinMotivo = pedir("POST", ruta, adm, UUID.randomUUID(), "{\"aprobado\":false}");
        assertEquals(400, sinMotivo.estado());
        assertEquals(
                "motivo", sinMotivo.cuerpo().get("errores").get(0).get("campo").asString());

        UUID clave = UUID.randomUUID();
        assertEquals(202, pedir("POST", ruta, adm, clave, "{\"aprobado\":true}").estado());
        JsonNode s = esperar(servicioId, c -> c.get("confirmacionCompleta").asBoolean());
        assertEquals("CONFIRMADO", s.get("estado").asString());
        assertTrue(finanzas.llamadas.contains("Finanzas.registrarDecisionCredito:APROBADA"));

        assertEquals(
                202, pedir("POST", ruta, adm, clave, "{\"aprobado\":true}").estado(), "reenvío: la respuesta guardada");
        var tarde = pedir("POST", ruta, adm, UUID.randomUUID(), "{\"aprobado\":true}");
        assertEquals(409, tarde.estado());
        assertEquals("CONFLICTO_ESTADO", tarde.cuerpo().get("codigo").asString());
        assertEquals(
                1,
                jdbc.sql("SELECT count(*) FROM auditoria WHERE accion = 'DECIDIR_CREDITO'")
                        .query(Integer.class)
                        .single());
    }

    @Test
    void rechazoConMotivoCancelaConCreditoRechazado() throws Exception {
        String servicioId = esperandoAprobacion();
        var r = pedir(
                "POST",
                "/api/v1/servicios/" + servicioId + "/aprobacion-credito",
                TokensDePrueba.token("sub-adm", "administracion", null),
                UUID.randomUUID(),
                "{\"aprobado\":false,\"motivo\":\"Mora de 20 días\"}");
        assertEquals(202, r.estado());
        JsonNode s = esperar(servicioId, c -> c.get("estado").asString().equals("CANCELADO"));
        assertEquals("CREDITO_RECHAZADO", s.get("motivo").asString());
        assertTrue(finanzas.llamadas.contains("Finanzas.liberarCredito:CREDITO_RECHAZADO"));
    }

    @Test
    void compensacionAgotadaQuedaEnIntervencionYElDespachadorLaResuelve() throws Exception {
        flota.respuesta = e -> {
            throw ApplicationFailure.newNonRetryableFailure(
                    "Sin cisterna",
                    "SIN_UNIDAD_COMPATIBLE",
                    new DetalleFallo("SIN_UNIDAD_COMPATIBLE", "No hay cisterna", null));
        };
        finanzas.alLiberar = () -> {
            throw new IllegalStateException("PostgreSQL de Finanzas caído");
        };
        var aceptado = confirmar(cliente(CLIENTE), "{\"cotizacionId\":\"" + COTIZACION + "\"}")
                .cuerpo();
        String servicioId = aceptado.get("servicioId").asString();
        String viajeId = aceptado.get("viajeId").asString();
        esperar(servicioId, c -> c.get("estado").asString().equals("REQUIERE_INTERVENCION"));
        JsonNode evento = sobre("ViajeRequiereIntervencion").get("datos");
        assertEquals(
                "Finanzas.liberarCredito", evento.get("compensacionFallida").asString());
        assertEquals(2, evento.get("intentos").asInt());

        String ruta = "/api/v1/viajes/" + viajeId + "/intervencion";
        String despachador = TokensDePrueba.token("sub-desp", "despachador", null);
        assertEquals(
                403,
                pedir(
                                "POST",
                                ruta,
                                TokensDePrueba.token("g", "gerente", null),
                                UUID.randomUUID(),
                                "{\"opcion\":\"REINTENTAR_COMPENSACION\"}")
                        .estado());
        assertEquals(
                400,
                pedir("POST", ruta, despachador, UUID.randomUUID(), "{\"opcion\":\"MARCAR_RESUELTO\"}")
                        .estado());
        assertEquals(
                202,
                pedir(
                                "POST",
                                ruta,
                                despachador,
                                UUID.randomUUID(),
                                "{\"opcion\":\"MARCAR_RESUELTO\",\"nota\":\"Liberado a mano en Finanzas\"}")
                        .estado());

        JsonNode s = esperar(servicioId, c -> c.get("estado").asString().equals("CANCELADO"));
        assertEquals("RESUELTO_MANUALMENTE", s.get("motivo").asString());
        assertEquals(
                "Resuelto manualmente: Liberado a mano en Finanzas",
                sobre("ViajeCancelado").get("datos").get("detalle").asString());
        assertEquals(
                409,
                pedir("POST", ruta, despachador, UUID.randomUUID(), "{\"opcion\":\"REINTENTAR_COMPENSACION\"}")
                        .estado());
        assertEquals(
                404,
                pedir(
                                "POST",
                                "/api/v1/viajes/" + UUID.randomUUID() + "/intervencion",
                                despachador,
                                UUID.randomUUID(),
                                "{\"opcion\":\"REINTENTAR_COMPENSACION\"}")
                        .estado());
    }
}
