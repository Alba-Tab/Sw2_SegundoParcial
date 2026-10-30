package bo.transporte.viajes.adaptadores.salida.push;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import bo.transporte.viajes.aplicacion.puerto.salida.NotificadorPush.Mensaje;
import bo.transporte.viajes.aplicacion.puerto.salida.NotificadorPush.Resultado;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** El mensaje de FCM HTTP v1 (D45) contra un servidor falso: token, canal `viajes`, collapse_key y respuestas. */
class NotificadorFcmTest {
    HttpServer fcm;
    final List<String> pedidos = new ArrayList<>();
    int estado = 200;

    @BeforeEach
    void iniciar() throws Exception {
        fcm = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        fcm.createContext("/", e -> {
            pedidos.add(e.getRequestURI() + " " + e.getRequestHeaders().getFirst("Authorization") + " "
                    + new String(e.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] r = (estado == 404 ? "{\"error\":{\"status\":\"NOT_FOUND\"}}" : "{\"name\":\"m/1\"}").getBytes();
            e.sendResponseHeaders(estado, r.length);
            e.getResponseBody().write(r);
            e.close();
        });
        fcm.start();
    }

    @AfterEach
    void detener() {
        fcm.stop(0);
    }

    NotificadorFcm notificador(String proyecto) {
        return new NotificadorFcm(
                proyecto,
                "http://localhost:" + fcm.getAddress().getPort(),
                () -> "token-google",
                JsonMapper.builder().build());
    }

    final Mensaje mensaje = new Mensaje("Viaje asignado", "Tienes un viaje", Map.of("viajeId", "v1"), "v1");

    @Test
    void enviaElMensajeConElCanalYLaClaveDeAgrupacion() {
        assertEquals(Resultado.ENVIADO, notificador("transporte-fcm").enviar("token-celular", mensaje));
        String p = pedidos.getFirst();
        assertTrue(p.startsWith("/v1/projects/transporte-fcm/messages:send Bearer token-google "), p);
        assertTrue(p.contains("\"token\":\"token-celular\""), p);
        assertTrue(p.contains("\"channel_id\":\"viajes\""), p);
        assertTrue(p.contains("\"collapse_key\":\"v1\""), p);
    }

    @Test
    void tokenNoRegistradoYProyectoSinConfigurar() {
        estado = 404;
        assertEquals(Resultado.TOKEN_INVALIDO, notificador("transporte-fcm").enviar("t", mensaje));
        assertEquals(Resultado.OMITIDO, notificador("").enviar("t", mensaje));
        assertEquals(1, pedidos.size());
    }
}
