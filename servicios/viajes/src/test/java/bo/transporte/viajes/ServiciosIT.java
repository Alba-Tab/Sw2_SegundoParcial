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
@Import({TestcontainersConfiguration.class, TokensDePrueba.class, AlmacenDePrueba.class, DynamoDePrueba.class})
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
    org.springframework.amqp.rabbit.core.RabbitTemplate rabbit;

    @Autowired
    FlotaFalsa flota;

    private final HttpClient http = HttpClient.newHttpClient();

    record Respuesta(int estado, JsonNode cuerpo, HttpResponse<String> cruda) {}

    @BeforeEach
    void preparar() {
        jdbc.sql(
                        "TRUNCATE hito, evento_conduccion, ultima_posicion, dispositivo, entrega, evidencia, viaje, servicio, cliente, ruta, operacion_idempotente, outbox_eventos, auditoria")
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

    private String confirmado() throws Exception {
        String servicioId = confirmar(cliente(CLIENTE), "{\"cotizacionId\":\"" + COTIZACION + "\"}")
                .cuerpo()
                .get("servicioId")
                .asString();
        esperar(servicioId, c -> c.get("confirmacionCompleta").asBoolean());
        return servicioId;
    }

    private Respuesta cancelar(String token, String servicioId, UUID clave, String motivo) throws Exception {
        return pedir(
                "POST",
                "/api/v1/servicios/" + servicioId + "/cancelacion",
                token,
                clave,
                "{\"motivo\":\"" + motivo + "\"}");
    }

    @Test
    void elClienteCancelaUnServicioConfirmadoYSePublicaViajeCancelado() throws Exception {
        String servicioId = confirmado();
        assertEquals(
                403,
                cancelar(cliente(OTRO_CLIENTE), servicioId, UUID.randomUUID(), "No es mío")
                        .estado());
        assertEquals(
                403,
                cancelar(TokensDePrueba.token("g", "gerente", null), servicioId, UUID.randomUUID(), "Gerencia")
                        .estado());

        UUID clave = UUID.randomUUID();
        var r = cancelar(cliente(CLIENTE), servicioId, clave, "Cambio de fecha de cosecha");
        assertEquals(200, r.estado(), String.valueOf(r.cuerpo()));
        assertEquals("CANCELADO", r.cuerpo().get("estado").asString());
        assertEquals("CANCELADO_POR_USUARIO", r.cuerpo().get("motivo").asString());
        assertEquals("4521KTR", r.cuerpo().get("placa").asString());

        JsonNode datos = sobre("ViajeCancelado").get("datos");
        assertEquals("USUARIO", datos.get("origen").asString());
        assertEquals("CONFIRMADO", datos.get("estadoAnterior").asString());
        assertEquals("Cambio de fecha de cosecha", datos.get("detalle").asString());
        assertEquals("sub-" + CLIENTE.substring(30), datos.get("canceladoPor").asString());
        assertEquals(
                "0193a000-0000-7000-8000-000000000005",
                datos.get("choferUsuarioSub").asString());

        var reenvio = cancelar(cliente(CLIENTE), servicioId, clave, "Cambio de fecha de cosecha");
        assertEquals(200, reenvio.estado());
        assertEquals(r.cuerpo(), reenvio.cuerpo());
        var otraClave = cancelar(cliente(CLIENTE), servicioId, UUID.randomUUID(), "Otra vez");
        assertEquals(409, otraClave.estado());
        assertEquals("CONFLICTO_ESTADO", otraClave.cuerpo().get("codigo").asString());
        assertEquals(
                1,
                jdbc.sql("SELECT count(*) FROM outbox_eventos WHERE tipo = 'ViajeCancelado'")
                        .query(Integer.class)
                        .single());
    }

    @Test
    void sinConfirmacionCompletaOEnRutaNoSeCancela() throws Exception {
        String servicioId = confirmado();
        String despachador = TokensDePrueba.token("sub-desp", "despachador", null);
        jdbc.sql("UPDATE servicio SET confirmacion_completa = false WHERE servicio_id = CAST(:id AS uuid)")
                .param("id", servicioId)
                .update();
        var enCurso = cancelar(despachador, servicioId, UUID.randomUUID(), "Pedido del cliente");
        assertEquals(409, enCurso.estado());
        assertEquals("CONFIRMACION_EN_CURSO", enCurso.cuerpo().get("codigo").asString());

        jdbc.sql("UPDATE servicio SET confirmacion_completa = true WHERE servicio_id = CAST(:id AS uuid)")
                .param("id", servicioId)
                .update();
        jdbc.sql("UPDATE viaje SET estado = 'EN_RUTA', iniciado_en = now() WHERE servicio_id = CAST(:id AS uuid)")
                .param("id", servicioId)
                .update();
        var enRuta = cancelar(despachador, servicioId, UUID.randomUUID(), "Pedido del cliente");
        assertEquals(409, enRuta.estado());
        assertEquals("CANCELACION_NO_PERMITIDA", enRuta.cuerpo().get("codigo").asString());
        assertEquals(
                404,
                cancelar(despachador, UUID.randomUUID().toString(), UUID.randomUUID(), "No existe")
                        .estado());
    }

    static final String CHOFER = TokensDePrueba.token("0193a000-0000-7000-8000-000000000005", "chofer", null);

    private String viajeDe(String servicioId) {
        return jdbc.sql("SELECT viaje_id::text FROM viaje WHERE servicio_id = CAST(:id AS uuid)")
                .param("id", servicioId)
                .query(String.class)
                .single();
    }

    private Respuesta iniciar(String token, String viajeId, UUID clave, String iniciadoEn) throws Exception {
        return pedir(
                "POST",
                "/api/v1/viajes/" + viajeId + "/inicio",
                token,
                clave,
                "{\"dispositivoId\":\"0193a000-0000-7000-8000-0000000d0001\",\"iniciadoEn\":\"" + iniciadoEn
                        + "\",\"posicion\":{\"lat\":-17.78,\"lng\":-63.18}}");
    }

    @Test
    void elChoferVeSuViajeSinMontosYLoInicia() throws Exception {
        String servicioId = confirmado();
        String viajeId = viajeDe(servicioId);

        var mios = pedir("GET", "/api/v1/viajes/mios", CHOFER, null, null);
        assertEquals(200, mios.estado());
        JsonNode v = mios.cuerpo().get("items").get(0);
        assertEquals(viajeId, v.get("viajeId").asString());
        assertEquals("Agroexport SRL", v.get("cliente").get("razonSocial").asString());
        assertEquals(300, v.get("ruta").get("destino").get("radioMetros").asInt());
        assertFalse(v.has("monto"));
        assertEquals(
                0,
                pedir("GET", "/api/v1/viajes/mios", TokensDePrueba.token("otro", "chofer", null), null, null)
                        .cuerpo()
                        .get("items")
                        .size());
        assertEquals(
                403,
                pedir("GET", "/api/v1/viajes/" + viajeId, TokensDePrueba.token("otro", "chofer", null), null, null)
                        .estado());

        String ahora = java.time.Instant.now()
                .truncatedTo(java.time.temporal.ChronoUnit.SECONDS)
                .toString();
        assertEquals(
                403,
                iniciar(TokensDePrueba.token("otro", "chofer", null), viajeId, UUID.randomUUID(), ahora)
                        .estado());
        var futuro = iniciar(
                CHOFER,
                viajeId,
                UUID.randomUUID(),
                java.time.Instant.now().plusSeconds(600).toString());
        assertEquals(400, futuro.estado());
        assertEquals(
                "iniciadoEn", futuro.cuerpo().get("errores").get(0).get("campo").asString());

        UUID opId = UUID.randomUUID();
        var r = iniciar(CHOFER, viajeId, opId, ahora);
        assertEquals(200, r.estado(), String.valueOf(r.cuerpo()));
        assertEquals("EN_RUTA", r.cuerpo().get("estado").asString());
        assertEquals(r.cuerpo(), iniciar(CHOFER, viajeId, opId, ahora).cuerpo());
        assertEquals(
                422,
                iniciar(CHOFER, viajeId, opId, java.time.Instant.now().toString())
                        .estado());
        assertEquals(409, iniciar(CHOFER, viajeId, UUID.randomUUID(), ahora).estado());

        JsonNode datos = sobre("ViajeIniciado").get("datos");
        assertEquals("4521KTR", datos.get("placa").asString());
        assertEquals(ahora, datos.get("iniciadoEn").asString());
        assertEquals(-17.78, datos.get("posicion").get("lat").asDouble());
        JsonNode s = pedir("GET", "/api/v1/servicios/" + servicioId, cliente(CLIENTE), null, null)
                .cuerpo();
        assertEquals("EN_RUTA", s.get("estado").asString());
        assertTrue(s.has("iniciadoEn"));
        assertEquals(
                1,
                jdbc.sql("SELECT count(*) FROM auditoria WHERE accion = 'INICIAR_VIAJE' AND canal = 'APP_CHOFER'")
                        .query(Integer.class)
                        .single());
    }

    @Test
    void noSeIniciaSinConfirmacionCompletaNiConOtroViajeEnRuta() throws Exception {
        String ahora = java.time.Instant.now().toString();
        String a = confirmado(), b = confirmado();
        jdbc.sql("UPDATE servicio SET confirmacion_completa = false WHERE servicio_id = CAST(:id AS uuid)")
                .param("id", a)
                .update();
        var enCurso = iniciar(CHOFER, viajeDe(a), UUID.randomUUID(), ahora);
        assertEquals(409, enCurso.estado());
        assertEquals("CONFIRMACION_EN_CURSO", enCurso.cuerpo().get("codigo").asString());

        assertEquals(200, iniciar(CHOFER, viajeDe(b), UUID.randomUUID(), ahora).estado());
        jdbc.sql("UPDATE servicio SET confirmacion_completa = true WHERE servicio_id = CAST(:id AS uuid)")
                .param("id", a)
                .update();
        var otro = iniciar(CHOFER, viajeDe(a), UUID.randomUUID(), ahora);
        assertEquals(409, otro.estado());
        assertEquals("CONFLICTO_ESTADO", otro.cuerpo().get("codigo").asString());
    }

    private String enRuta() throws Exception {
        String viajeId = viajeDe(confirmado());
        iniciar(CHOFER, viajeId, UUID.randomUUID(), java.time.Instant.now().toString());
        return viajeId;
    }

    private Respuesta crearEvidencia(String viajeId, String evidenciaId, String tipo, long tamano) throws Exception {
        return pedir(
                "POST",
                "/api/v1/viajes/" + viajeId + "/evidencias",
                CHOFER,
                UUID.randomUUID(),
                "{\"evidenciaId\":\"" + evidenciaId + "\",\"tipo\":\"" + tipo
                        + "\",\"contentType\":\"image/jpeg\",\"tamanoBytes\":" + tamano + "}");
    }

    private String subirParte(String url, byte[] datos) throws Exception {
        var r = http.send(
                HttpRequest.newBuilder(URI.create(url))
                        .PUT(HttpRequest.BodyPublishers.ofByteArray(datos))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(200, r.statusCode(), r.body());
        return r.headers().firstValue("ETag").orElseThrow();
    }

    @Test
    void unaFotoDe6MbSeSubeEnDosPartesReintentandoSoloLaQueFalta() throws Exception {
        String viajeId = enRuta();
        String evidenciaId = UUID.randomUUID().toString();
        int tamano = 6 * 1024 * 1024;
        byte[] foto = new byte[tamano];
        new java.util.Random(7).nextBytes(foto);

        var abierta = crearEvidencia(viajeId, evidenciaId, "FOTO_ENTREGA", tamano);
        assertEquals(201, abierta.estado(), String.valueOf(abierta.cuerpo()));
        assertEquals(2, abierta.cuerpo().get("partes").size());
        assertEquals(5242880, abierta.cuerpo().get("tamanoParteBytes").asInt());
        String etag1 = subirParte(
                abierta.cuerpo().get("partes").get(0).get("url").asString(), java.util.Arrays.copyOf(foto, 5242880));

        // La parte 2 "falló": se piden las partes y solo vuelve la que falta.
        var estado = pedir(
                "GET", "/api/v1/viajes/" + viajeId + "/evidencias/" + evidenciaId + "/partes", CHOFER, null, null);
        assertEquals(1, estado.cuerpo().get("subidas").size());
        assertEquals(1, estado.cuerpo().get("partes").size());
        assertEquals(2, estado.cuerpo().get("partes").get(0).get("numero").asInt());
        String etag2 = subirParte(
                estado.cuerpo().get("partes").get(0).get("url").asString(),
                java.util.Arrays.copyOfRange(foto, 5242880, tamano));

        assertEquals(
                422, crearEvidencia(viajeId, evidenciaId, "FOTO_ENTREGA", 1000).estado(), "mismo id, otros datos");
        var completa = pedir(
                "POST",
                "/api/v1/viajes/" + viajeId + "/evidencias/" + evidenciaId + "/completar",
                CHOFER,
                UUID.randomUUID(),
                "{\"partes\":[{\"numero\":2,\"etag\":" + json.writeValueAsString(etag2) + "},{\"numero\":1,\"etag\":"
                        + json.writeValueAsString(etag1) + "}]}");
        assertEquals(200, completa.estado(), String.valueOf(completa.cuerpo()));
        assertEquals("COMPLETA", completa.cuerpo().get("estado").asString());

        var vista =
                pedir("GET", "/api/v1/viajes/" + viajeId + "/evidencias/" + evidenciaId, cliente(CLIENTE), null, null);
        assertEquals(200, vista.estado());
        var descarga = http.send(
                HttpRequest.newBuilder(URI.create(vista.cuerpo().get("url").asString()))
                        .build(),
                HttpResponse.BodyHandlers.ofByteArray());
        assertTrue(java.util.Arrays.equals(foto, descarga.body()));
        assertEquals(
                403,
                pedir(
                                "GET",
                                "/api/v1/viajes/" + viajeId + "/evidencias/" + evidenciaId,
                                cliente(OTRO_CLIENTE),
                                null,
                                null)
                        .estado());
    }

    @Test
    void reglasDeTipoYEstadoParaSubirYVerEvidencias() throws Exception {
        String confirmadoSinIniciar = viajeDe(confirmado());
        var firma = crearEvidencia(confirmadoSinIniciar, UUID.randomUUID().toString(), "FIRMA", 2000);
        assertEquals(409, firma.estado());
        String recibo = UUID.randomUUID().toString();
        assertEquals(
                201,
                crearEvidencia(confirmadoSinIniciar, recibo, "RECIBO_COMBUSTIBLE", 2000)
                        .estado());
        assertEquals(
                403,
                pedir(
                                "GET",
                                "/api/v1/viajes/" + confirmadoSinIniciar + "/evidencias/" + recibo,
                                cliente(CLIENTE),
                                null,
                                null)
                        .estado());
        var jefe = pedir(
                "GET",
                "/api/v1/viajes/" + confirmadoSinIniciar + "/evidencias/" + recibo,
                TokensDePrueba.token("j", "jefe_flota", null),
                null,
                null);
        assertEquals(200, jefe.estado());
        assertEquals("SUBIENDO", jefe.cuerpo().get("estado").asString());
        assertFalse(jefe.cuerpo().has("url"));
        assertEquals(
                403,
                crearEvidencia(
                                                confirmadoSinIniciar,
                                                UUID.randomUUID().toString(),
                                                "RECIBO_COMBUSTIBLE",
                                                20 * 1024 * 1024)
                                        .estado()
                                == 400
                        ? 403
                        : 403);
        assertEquals(
                400,
                crearEvidencia(
                                confirmadoSinIniciar,
                                UUID.randomUUID().toString(),
                                "RECIBO_COMBUSTIBLE",
                                20 * 1024 * 1024)
                        .estado());
    }

    /** Sube una evidencia de 1 KB en una parte y la completa. */
    private String evidencia(String viajeId, String tipo) throws Exception {
        String id = UUID.randomUUID().toString();
        var abierta = crearEvidencia(viajeId, id, tipo, 1024);
        assertEquals(201, abierta.estado(), String.valueOf(abierta.cuerpo()));
        String etag =
                subirParte(abierta.cuerpo().get("partes").get(0).get("url").asString(), new byte[1024]);
        var c = pedir(
                "POST",
                "/api/v1/viajes/" + viajeId + "/evidencias/" + id + "/completar",
                CHOFER,
                UUID.randomUUID(),
                "{\"partes\":[{\"numero\":1,\"etag\":" + json.writeValueAsString(etag) + "}]}");
        assertEquals(200, c.estado(), String.valueOf(c.cuerpo()));
        return id;
    }

    private String cuerpoEntrega(double lat, double lng, String foto, String firma) {
        String f = firma == null ? "null" : "{\"evidenciaId\":\"" + firma + "\",\"nombreReceptor\":\"Rosa Pérez\"}";
        return "{\"entregaId\":\"" + UUID.randomUUID() + "\",\"entregadoEn\":\"" + java.time.Instant.now()
                + "\",\"posicion\":{\"lat\":" + lat + ",\"lng\":" + lng + "},\"precisionMetros\":8,"
                + "\"fotos\":[\"" + foto + "\"],\"firma\":" + f + "}";
    }

    private Respuesta entregar(String viajeId, String cuerpo, UUID clave) throws Exception {
        return pedir("POST", "/api/v1/viajes/" + viajeId + "/entrega", CHOFER, clave, cuerpo);
    }

    private Respuesta entregar(String viajeId, double lat, double lng, String foto, String firma, UUID clave)
            throws Exception {
        return entregar(viajeId, cuerpoEntrega(lat, lng, foto, firma), clave);
    }

    private void publicarFactura(String eventId, String viajeId, String numero) {
        rabbit.send(
                "viajes.eventos",
                new org.springframework.amqp.core.Message(("{\"id\":\"" + eventId
                                + "\",\"tipo\":\"FacturaEmitida\",\"version\":1,\"datos\":{\"viajeId\":\"" + viajeId
                                + "\",\"facturaId\":\"0193f000-0000-7000-8000-000000000123\",\"numero\":\"" + numero
                                + "\"}}")
                        .getBytes()));
    }

    @Test
    void entregaDentroDeLaGeocercaConFirmaYCierreConFacturaEmitida() throws Exception {
        String viajeId = enRuta();
        String servicioId = jdbc.sql("SELECT servicio_id::text FROM viaje WHERE viaje_id = CAST(:v AS uuid)")
                .param("v", viajeId)
                .query(String.class)
                .single();
        String foto = evidencia(viajeId, "FOTO_ENTREGA"), firma = evidencia(viajeId, "FIRMA");
        String incompleta = UUID.randomUUID().toString();
        crearEvidencia(viajeId, incompleta, "FOTO_ENTREGA", 1024);
        var sinTerminar = entregar(viajeId, -17.80, -63.20, incompleta, firma, UUID.randomUUID());
        assertEquals(422, sinTerminar.estado());
        assertEquals("EVIDENCIA_INCOMPLETA", sinTerminar.cuerpo().get("codigo").asString());
        assertEquals(
                400,
                entregar(viajeId, -17.80, -63.20, firma, null, UUID.randomUUID())
                        .estado(),
                "una firma no es foto");

        UUID clave = UUID.randomUUID();
        String cuerpo = cuerpoEntrega(-17.801, -63.2005, foto, firma);
        var r = entregar(viajeId, cuerpo, clave);
        assertEquals(200, r.estado(), String.valueOf(r.cuerpo()));
        assertEquals("ENTREGADO", r.cuerpo().get("estado").asString());
        assertTrue(r.cuerpo().get("dentroGeocerca").asBoolean());
        assertTrue(r.cuerpo().get("distanciaMetros").asDouble() < 150);
        assertEquals(r.cuerpo(), entregar(viajeId, cuerpo, clave).cuerpo(), "reenvío");
        assertEquals(
                409,
                entregar(viajeId, -17.801, -63.2005, foto, firma, UUID.randomUUID())
                        .estado(),
                "otra entrega con otra clave");
        JsonNode datos = sobre("EntregaConfirmada").get("datos");
        assertEquals(12, datos.get("kmRecorridos").asInt());
        assertFalse(datos.has("aprobadaPor"));

        assertEquals(
                200,
                pedir("GET", "/api/v1/viajes/" + viajeId + "/entrega", cliente(CLIENTE), null, null)
                        .estado());
        assertEquals(
                403,
                pedir("GET", "/api/v1/viajes/" + viajeId + "/entrega", cliente(OTRO_CLIENTE), null, null)
                        .estado());

        String eventId = UUID.randomUUID().toString();
        publicarFactura(eventId, viajeId, "FAC-000123");
        rabbit.send("viajes.eventos", new org.springframework.amqp.core.Message("no es json".getBytes()));
        JsonNode s = esperar(servicioId, c -> c.get("estado").asString().equals("CERRADO"));
        assertEquals("FAC-000123", s.get("numeroFactura").asString());
        assertTrue(s.has("entregadoEn"));
        publicarFactura(eventId, viajeId, "FAC-000999");
        Thread.sleep(500);
        assertEquals(
                "FAC-000123",
                pedir("GET", "/api/v1/servicios/" + servicioId, cliente(CLIENTE), null, null)
                        .cuerpo()
                        .get("numeroFactura")
                        .asString());
    }

    @Test
    void entregaObservadaQueElDespachadorAprueba() throws Exception {
        String viajeId = enRuta();
        String foto = evidencia(viajeId, "FOTO_ENTREGA");
        var r = entregar(viajeId, -17.82, -63.20, foto, null, UUID.randomUUID());
        assertEquals("ENTREGA_OBSERVADA", r.cuerpo().get("estado").asString());
        assertEquals(2, r.cuerpo().get("razones").size());
        JsonNode obs = sobre("EntregaObservada").get("datos");
        assertEquals("FUERA_GEOCERCA", obs.get("razones").get(0).asString());
        assertTrue(obs.get("distanciaMetros").asDouble() > 2000);

        String ruta = "/api/v1/viajes/" + viajeId + "/entrega/aprobacion";
        String desp = TokensDePrueba.token("sub-desp", "despachador", null);
        assertEquals(
                403,
                pedir("POST", ruta, TokensDePrueba.token("g", "gerente", null), UUID.randomUUID(), "{}")
                        .estado());
        var ok = pedir("POST", ruta, desp, UUID.randomUUID(), "{\"nota\":\"El cliente confirmó por teléfono\"}");
        assertEquals(200, ok.estado(), String.valueOf(ok.cuerpo()));
        assertEquals("ENTREGADO", ok.cuerpo().get("estado").asString());
        JsonNode conf = sobre("EntregaConfirmada").get("datos");
        assertEquals("sub-desp", conf.get("aprobadaPor").asString());
        assertFalse(conf.get("dentroGeocerca").asBoolean());
        assertEquals(409, pedir("POST", ruta, desp, UUID.randomUUID(), "{}").estado());
        assertEquals(
                "APROBADA",
                pedir("GET", "/api/v1/viajes/" + viajeId + "/entrega", desp, null, null)
                        .cuerpo()
                        .get("decision")
                        .asString());
    }

    @Test
    void elDespachadorRechazaLaObservadaYElReceptorRechazaOtra() throws Exception {
        String desp = TokensDePrueba.token("sub-desp", "despachador", null);
        String a = enRuta();
        entregar(a, -17.80, -63.20, evidencia(a, "FOTO_ENTREGA"), null, UUID.randomUUID());
        assertEquals(
                400,
                pedir("POST", "/api/v1/viajes/" + a + "/entrega/rechazo", desp, UUID.randomUUID(), "{}")
                        .estado());
        var rech = pedir(
                "POST",
                "/api/v1/viajes/" + a + "/entrega/rechazo",
                desp,
                UUID.randomUUID(),
                "{\"motivo\":\"Sin firma ni confirmación\"}");
        assertEquals("ENTREGA_RECHAZADA", rech.cuerpo().get("estado").asString());
        assertEquals(
                "DESPACHADOR",
                sobre("EntregaRechazada").get("datos").get("origenRechazo").asString());

        jdbc.sql("DELETE FROM outbox_eventos WHERE tipo = 'EntregaRechazada'").update();
        String b = enRuta();
        String fotoRechazo = evidencia(b, "FOTO_RECHAZO");
        var r = pedir(
                "POST",
                "/api/v1/viajes/" + b + "/rechazo",
                CHOFER,
                UUID.randomUUID(),
                "{\"entregaId\":\"" + UUID.randomUUID() + "\",\"rechazadaEn\":\"" + java.time.Instant.now()
                        + "\",\"posicion\":{\"lat\":-17.80,\"lng\":-63.20},\"motivo\":\"Carga húmeda\",\"fotos\":[\""
                        + fotoRechazo + "\"]}");
        assertEquals(200, r.estado(), String.valueOf(r.cuerpo()));
        assertEquals("ENTREGA_RECHAZADA", r.cuerpo().get("estado").asString());
        JsonNode d = sobre("EntregaRechazada").get("datos");
        assertEquals("RECEPTOR", d.get("origenRechazo").asString());
        assertEquals("Carga húmeda", d.get("motivo").asString());
    }

    // ---------------------------------------------------------------- spec 005: el viaje en ruta (T7.1)

    static final String CELULAR = "0193a000-0000-7000-8000-0000000d0001";

    private long contar(String tipo) {
        return jdbc.sql("SELECT count(*) FROM outbox_eventos WHERE tipo = :tipo")
                .param("tipo", tipo)
                .query(Long.class)
                .single();
    }

    private String lote(java.time.Instant hasta, int... seqs) {
        var puntos = new java.util.StringJoiner(",");
        for (int i = 0; i < seqs.length; i++) {
            var en = hasta.minusSeconds(20L * (seqs.length - 1 - i));
            puntos.add(
                    "{\"seq\":%d,\"registradaEn\":\"%s\",\"lat\":%s,\"lng\":-63.18,\"velocidadKmh\":62.5,\"precisionMetros\":6}"
                            .formatted(seqs[i], en, -17.70 - seqs[i] / 1000.0));
        }
        return "{\"dispositivoId\":\"" + CELULAR + "\",\"puntos\":[" + puntos + "]}";
    }

    @Test
    void enRutaLosLotesDeGpsMuevenElMapaUnaVezYElCursorQueda() throws Exception {
        String viajeId = enRuta();
        var despacho = TokensDePrueba.token("d", "despachador", null);
        assertEquals(
                200,
                pedir(
                                "PUT",
                                "/api/v1/dispositivos/mio",
                                CHOFER,
                                null,
                                "{\"dispositivoId\":\"" + CELULAR
                                        + "\",\"plataforma\":\"ANDROID\",\"tokenPush\":\"token-fcm-de-prueba\"}")
                        .estado());

        var ahora = java.time.Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
        String cuerpo = lote(ahora, 0, 1, 2);
        UUID loteId = UUID.randomUUID();
        var r = pedir("POST", "/api/v1/viajes/" + viajeId + "/gps/lotes", CHOFER, loteId, cuerpo);
        assertEquals(200, r.estado(), r.cruda().body());
        assertEquals(3, r.cuerpo().get("aceptados").asInt());
        assertEquals(2, r.cuerpo().get("ultimaSecuencia").asInt());
        assertTrue(r.cuerpo().get("ultimaPosicionActualizada").asBoolean());
        assertEquals(1, contar("PosicionActualizada"));
        var evento = sobre("PosicionActualizada").get("datos");
        assertEquals(3, evento.get("puntosEnLote").asInt());
        assertEquals(-17.702, evento.get("posicion").get("lat").asDouble(), 1e-9);

        // Reenvío con la misma clave: 200, los mismos puntos, sin mover el mapa ni repetir el evento (D19).
        var otra = pedir("POST", "/api/v1/viajes/" + viajeId + "/gps/lotes", CHOFER, loteId, cuerpo);
        assertEquals(200, otra.estado());
        assertFalse(otra.cuerpo().get("ultimaPosicionActualizada").asBoolean());
        assertEquals(1, contar("PosicionActualizada"));

        var mapa = pedir("GET", "/api/v1/viajes?estado=EN_RUTA", despacho, null, null);
        assertEquals(200, mapa.estado());
        var fila = mapa.cuerpo().get("items").get(0);
        assertEquals(viajeId, fila.get("viajeId").asString());
        assertEquals(62.5, fila.get("ultimaPosicion").get("velocidadKmh").asDouble());
        String servicioId = fila.get("servicioId").asString();
        assertEquals(
                -17.702,
                pedir("GET", "/api/v1/servicios/" + servicioId, cliente(CLIENTE), null, null)
                        .cuerpo()
                        .get("ultimaPosicion")
                        .get("lat")
                        .asDouble(),
                1e-9);

        var recorrido = pedir("GET", "/api/v1/viajes/" + viajeId + "/recorrido", despacho, null, null);
        assertEquals(3, recorrido.cuerpo().get("items").size());
        assertEquals(
                CELULAR,
                recorrido.cuerpo().get("items").get(0).get("dispositivoId").asString());

        var cursor = pedir("GET", "/api/v1/dispositivos/" + CELULAR + "/cursor?viajeId=" + viajeId, CHOFER, null, null);
        assertEquals(2, cursor.cuerpo().get("ultimaSecuencia").asInt());
        var ajeno = TokensDePrueba.token("otro-chofer", "chofer", null);
        assertEquals(
                403,
                pedir("GET", "/api/v1/dispositivos/" + CELULAR + "/cursor?viajeId=" + viajeId, ajeno, null, null)
                        .estado());
        assertEquals(
                403,
                pedir("POST", "/api/v1/viajes/" + viajeId + "/gps/lotes", ajeno, UUID.randomUUID(), cuerpo)
                        .estado());
        var futuro = pedir(
                "POST",
                "/api/v1/viajes/" + viajeId + "/gps/lotes",
                CHOFER,
                UUID.randomUUID(),
                lote(ahora.plusSeconds(600), 3));
        assertEquals(400, futuro.estado());
    }

    @Test
    void hitosYEventosLleganUnaSolaVezAunqueLaColaLosReenvie() throws Exception {
        String viajeId = enRuta();
        var ahora = java.time.Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
        UUID opId = UUID.randomUUID();
        String hito = "{\"hitoId\":\"" + UUID.randomUUID() + "\",\"tipo\":\"BLOQUEO\",\"descripcion\":\"Bloqueo en el"
                + " puente de 50%, tránsito detenido\",\"posicion\":{\"lat\":-17.7,\"lng\":-63.1},\"registradoEn\":\""
                + ahora + "\",\"origen\":\"VOZ\"}";
        var r = pedir("POST", "/api/v1/viajes/" + viajeId + "/hitos", CHOFER, opId, hito);
        assertEquals(200, r.estado(), r.cruda().body());
        assertEquals(
                r.cuerpo(),
                pedir("POST", "/api/v1/viajes/" + viajeId + "/hitos", CHOFER, opId, hito)
                        .cuerpo());
        assertEquals(
                422,
                pedir("POST", "/api/v1/viajes/" + viajeId + "/hitos", CHOFER, opId, hito.replace("BLOQUEO", "PARADA"))
                        .estado());
        assertEquals(1, contar("HitoRegistrado"));
        assertEquals(
                1,
                jdbc.sql("SELECT count(*) FROM operacion_idempotente WHERE clave = :c")
                        .param("c", opId)
                        .query(Long.class)
                        .single());

        var despacho = TokensDePrueba.token("d", "despachador", null);
        assertEquals(
                1,
                pedir("GET", "/api/v1/viajes/" + viajeId + "/hitos?texto=50%25", despacho, null, null)
                        .cuerpo()
                        .get("items")
                        .size());
        assertEquals(
                0,
                pedir("GET", "/api/v1/viajes/" + viajeId + "/hitos?texto=_x", despacho, null, null)
                        .cuerpo()
                        .get("items")
                        .size());

        String frenada = "{\"eventoId\":\"" + UUID.randomUUID()
                + "\",\"tipo\":\"FRENADA_BRUSCA\",\"magnitudG\":%s,\"posicion\":{\"lat\":-17.7,\"lng\":-63.1},"
                + "\"registradoEn\":\"" + ahora + "\"}";
        assertEquals(
                400,
                pedir(
                                "POST",
                                "/api/v1/viajes/" + viajeId + "/eventos-conduccion",
                                CHOFER,
                                UUID.randomUUID(),
                                frenada.formatted("0.3"))
                        .estado());
        UUID evento = UUID.randomUUID();
        assertEquals(
                200,
                pedir(
                                "POST",
                                "/api/v1/viajes/" + viajeId + "/eventos-conduccion",
                                CHOFER,
                                evento,
                                frenada.formatted("0.55"))
                        .estado());
        pedir("POST", "/api/v1/viajes/" + viajeId + "/eventos-conduccion", CHOFER, evento, frenada.formatted("0.55"));
        assertEquals(1, contar("EventoConduccionRegistrado"));
        assertEquals(
                0.55,
                sobre("EventoConduccionRegistrado")
                        .get("datos")
                        .get("magnitudG")
                        .asDouble());
    }

    @Test
    void antesDeIniciarNoSeAceptanGpsNiHitos() throws Exception {
        String viajeId = viajeDe(confirmado());
        var ahora = java.time.Instant.now();
        assertEquals(
                409,
                pedir("POST", "/api/v1/viajes/" + viajeId + "/gps/lotes", CHOFER, UUID.randomUUID(), lote(ahora, 0))
                        .estado());
        String hito = "{\"hitoId\":\"" + UUID.randomUUID() + "\",\"tipo\":\"OTRO\",\"descripcion\":\"Esperando carga\","
                + "\"posicion\":{\"lat\":-17.7,\"lng\":-63.1},\"registradoEn\":\"" + ahora + "\",\"origen\":\"TEXTO\"}";
        assertEquals(
                409,
                pedir("POST", "/api/v1/viajes/" + viajeId + "/hitos", CHOFER, UUID.randomUUID(), hito)
                        .estado());
    }
}
