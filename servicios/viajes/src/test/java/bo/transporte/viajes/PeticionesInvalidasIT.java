package bo.transporte.viajes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Errores del contenedor y del framework: 400 VALIDACION con detalle en español, nunca 500 ni el texto de Spring, y
 * 413 VALIDACION para un cuerpo de más de 256 KB. Misma configuración que ServiciosIT para reusar su contexto.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "seguridad.issuer=http://localhost:1/realms/transporte",
            "outbox.intervalo=PT1H",
            "saga.compensacion.maximo-intentos=2"
        })
@Import({TestcontainersConfiguration.class, TokensDePrueba.class, AlmacenDePrueba.class, DynamoDePrueba.class})
class PeticionesInvalidasIT {
    static final String GERENTE = TokensDePrueba.token("g", "gerente", null);
    static final String CLIENTE = TokensDePrueba.token("sub-c", "cliente", "01933b5a-1f00-7a20-8b11-0c2d3e4f5a01");

    @LocalServerPort
    int puerto;

    @Autowired
    JsonMapper json;

    private final HttpClient http = HttpClient.newHttpClient();

    record Respuesta(int estado, String tipo, JsonNode cuerpo) {}

    /**
     * Por socket: HttpClient no deja mandar una consulta con %A o %FF tal cual, ni anunciar un cuerpo sin mandarlo. Lee
     * hasta completar la respuesta (Content-Length o el último trozo), sin esperar a que el servidor cierre.
     */
    private Respuesta crudo(String cabecera, String token) throws IOException {
        try (var s = new Socket("localhost", puerto)) {
            s.setSoTimeout(10_000);
            String pedido = cabecera + "\r\nHost: localhost\r\nAuthorization: Bearer " + token
                    + "\r\nConnection: close\r\n\r\n";
            s.getOutputStream().write(pedido.getBytes(StandardCharsets.ISO_8859_1));
            s.getOutputStream().flush();
            var leido = new ByteArrayOutputStream();
            InputStream entrada = s.getInputStream();
            byte[] buffer = new byte[4096];
            String r = "";
            while (!completa(r)) {
                int n = entrada.read(buffer);
                if (n < 0) break;
                leido.write(buffer, 0, n);
                r = leido.toString(StandardCharsets.UTF_8);
            }
            int estado = Integer.parseInt(r.substring(9, 12));
            String encabezados = r.substring(0, r.indexOf("\r\n\r\n")).toLowerCase();
            String tipo = encabezados.contains("content-type: application/problem+json") ? "problem" : "otro";
            String cuerpo = r.substring(r.indexOf('{'), r.lastIndexOf('}') + 1);
            return new Respuesta(estado, tipo, json.readTree(cuerpo));
        }
    }

    private static boolean completa(String r) {
        int fin = r.indexOf("\r\n\r\n");
        if (fin < 0) return false;
        String encabezados = r.substring(0, fin).toLowerCase();
        if (encabezados.contains("transfer-encoding: chunked")) return r.endsWith("\r\n0\r\n\r\n");
        Matcher largo = Pattern.compile("content-length: (\\d+)").matcher(encabezados);
        return largo.find()
                && r.substring(fin + 4).getBytes(StandardCharsets.UTF_8).length >= Integer.parseInt(largo.group(1));
    }

    private Respuesta pedir(String metodo, String ruta, String token, HttpRequest.BodyPublisher cuerpo)
            throws Exception {
        var b = HttpRequest.newBuilder(URI.create("http://localhost:" + puerto + ruta))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .method(metodo, cuerpo);
        if (metodo.equals("POST")) b.header("Idempotency-Key", UUID.randomUUID().toString());
        var r = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
        String tipo = r.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json")
                ? "problem"
                : "otro";
        return new Respuesta(r.statusCode(), tipo, r.body().isBlank() ? null : json.readTree(r.body()));
    }

    private static void validacion(Respuesta r, int estado) {
        assertEquals(estado, r.estado(), String.valueOf(r.cuerpo()));
        assertEquals("problem", r.tipo());
        assertEquals("VALIDACION", r.cuerpo().get("codigo").asString());
        assertTrue(r.cuerpo().has("correlationId"));
    }

    @Test
    void unaConsultaMalCodificadaEs400YNo500() throws Exception {
        for (String ruta : List.of(
                "/api/v1/viajes?estado=%FF",
                "/api/v1/viajes?estado=%A",
                "/api/v1/viajes?estado=%C0%AF",
                "/api/v1/servicios?estado=%FF",
                "/api/v1/clientes?q=%FF")) {
            var r = crudo("GET " + ruta + " HTTP/1.1", GERENTE);
            validacion(r, 400);
            assertTrue(r.cuerpo().get("detail").asString().contains("mal codificado"), ruta);
        }
    }

    @Test
    void losErroresDelFrameworkSalenEnEspanolConSuCampo() throws Exception {
        var tipo = pedir("GET", "/api/v1/viajes?estado=VOLANDO", GERENTE, HttpRequest.BodyPublishers.noBody());
        validacion(tipo, 400);
        assertEquals("estado: valor inválido", tipo.cuerpo().get("detail").asString());
        assertEquals("estado", tipo.cuerpo().get("errores").get(0).get("campo").asString());

        var ruta = pedir("GET", "/api/v1/viajes/no-es-uuid", GERENTE, HttpRequest.BodyPublishers.noBody());
        validacion(ruta, 400);
        assertEquals("viajeId", ruta.cuerpo().get("errores").get(0).get("campo").asString());

        var falta = pedir(
                "GET",
                "/api/v1/dispositivos/" + UUID.randomUUID() + "/cursor",
                TokensDePrueba.token("ch", "chofer", null),
                HttpRequest.BodyPublishers.noBody());
        validacion(falta, 400);
        assertEquals("Falta el parámetro viajeId", falta.cuerpo().get("detail").asString());

        var sinClave = http.send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + puerto + "/api/v1/servicios"))
                        .header("Authorization", "Bearer " + CLIENTE)
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString("{\"cotizacionId\":\"" + UUID.randomUUID() + "\"}"))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(400, sinClave.statusCode());
        JsonNode p = json.readTree(sinClave.body());
        assertEquals("Falta el encabezado Idempotency-Key", p.get("detail").asString());
        assertEquals("Idempotency-Key", p.get("errores").get(0).get("campo").asString());

        var roto = pedir("POST", "/api/v1/servicios", CLIENTE, HttpRequest.BodyPublishers.ofString("{no es json"));
        validacion(roto, 400);
        assertEquals(
                "El cuerpo no es JSON válido o no sigue el contrato",
                roto.cuerpo().get("detail").asString());

        var malTipo = pedir(
                "POST",
                "/api/v1/servicios",
                CLIENTE,
                HttpRequest.BodyPublishers.ofString("{\"cotizacionId\":\"no-es-uuid\"}"));
        validacion(malTipo, 400);
        assertEquals(
                "cotizacionId",
                malTipo.cuerpo().get("errores").get(0).get("campo").asString());

        var metodo = pedir("DELETE", "/api/v1/viajes", GERENTE, HttpRequest.BodyPublishers.noBody());
        assertEquals(405, metodo.estado());
        assertEquals(
                "El método DELETE no existe en esta ruta",
                metodo.cuerpo().get("detail").asString());

        for (var r : List.of(tipo, ruta, falta, roto, malTipo, metodo)) {
            String detalle = r.cuerpo().get("detail").asString();
            assertFalse(detalle.contains("Failed") || detalle.contains("Required"), detalle);
        }
    }

    @Test
    void unCuerpoDeMasDe256KbEs413SinLeerlo() throws Exception {
        String grande = "{\"cotizacionId\":\"" + "a".repeat(300 * 1024) + "\"}";
        var conLargo = pedir("POST", "/api/v1/servicios", CLIENTE, HttpRequest.BodyPublishers.ofString(grande));
        validacion(conLargo, 413);
        assertEquals(
                "El cuerpo pasa el máximo de 256 KB",
                conLargo.cuerpo().get("detail").asString());

        byte[] bytes = grande.getBytes(StandardCharsets.UTF_8);
        var sinLargo = pedir("POST", "/api/v1/servicios", CLIENTE, HttpRequest.BodyPublishers.ofInputStream(() ->
                (InputStream) new ByteArrayInputStream(bytes)));
        validacion(sinLargo, 413);

        // 10 MB anunciados: responde con solo leer el encabezado, sin esperar el cuerpo.
        var diezMb = crudo(
                "POST /api/v1/servicios HTTP/1.1\r\nContent-Type: application/json\r\nContent-Length: 10485760"
                        + "\r\nIdempotency-Key: " + UUID.randomUUID(),
                CLIENTE);
        validacion(diezMb, 413);
    }
}
