package bo.transporte.viajes.adaptadores.salida.push;

import bo.transporte.viajes.aplicacion.puerto.salida.NotificadorPush;
import com.google.auth.oauth2.GoogleCredentials;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * FCM HTTP v1 (D45). La credencial sale de la cadena por defecto de Google: en local una cuenta de servicio fuera del
 * repo ({@code GOOGLE_APPLICATION_CREDENTIALS}); en la nube, Workload Identity Federation con el rol de la EC2, sin
 * clave guardada. Sin {@code FCM_PROYECTO}, cada envío se omite sin error. Canal de Android {@code viajes} (PoC-4).
 * D69: hasta 5 intentos con espera exponencial ante 429, 5xx o una falla de red; un token inválido no se reintenta.
 */
@Component
class NotificadorFcm implements NotificadorPush {
    private static final Logger LOG = LoggerFactory.getLogger(NotificadorFcm.class);
    private static final String ALCANCE = "https://www.googleapis.com/auth/firebase.messaging";

    private final String proyecto;
    private final String base;
    private final Supplier<String> tokenDeAcceso;
    private final JsonMapper json;
    private final Duration esperaInicial;
    static final int INTENTOS = 5;
    private final HttpClient http =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @Autowired
    NotificadorFcm(
            @Value("${push.fcm-proyecto:}") String proyecto,
            @Value("${push.fcm-url:https://fcm.googleapis.com}") String base,
            JsonMapper json) {
        this(proyecto, base, credencialDeGoogle(proyecto), json, Duration.ofMillis(500));
    }

    NotificadorFcm(
            String proyecto, String base, Supplier<String> tokenDeAcceso, JsonMapper json, Duration esperaInicial) {
        this.proyecto = proyecto;
        this.base = base;
        this.tokenDeAcceso = tokenDeAcceso;
        this.json = json;
        this.esperaInicial = esperaInicial;
    }

    private static Supplier<String> credencialDeGoogle(String proyecto) {
        if (proyecto.isBlank()) return () -> null;
        return new Supplier<>() {
            private GoogleCredentials credencial;

            @Override
            public synchronized String get() {
                try {
                    if (credencial == null)
                        credencial = GoogleCredentials.getApplicationDefault().createScoped(ALCANCE);
                    credencial.refreshIfExpired();
                    return credencial.getAccessToken().getTokenValue();
                } catch (IOException e) {
                    throw new IllegalStateException("Sin credencial de Google para FCM", e);
                }
            }
        };
    }

    @Override
    public Resultado enviar(String tokenPush, Mensaje m) {
        if (proyecto.isBlank()) return Resultado.OMITIDO;
        var cuerpo = Map.of(
                "message",
                Map.of(
                        "token",
                        tokenPush,
                        "notification",
                        Map.of("title", m.titulo(), "body", m.cuerpo()),
                        "data",
                        m.datos(),
                        "android",
                        Map.of(
                                "collapse_key", m.agrupar(),
                                "priority", "high",
                                "notification", Map.of("channel_id", "viajes"))));
        for (int intento = 1; ; intento++) {
            Intento r = intentar(cuerpo);
            if (!r.reintentar() || intento == INTENTOS) return r.resultado();
            try {
                Thread.sleep(esperaInicial.multipliedBy(1L << (intento - 1)));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return Resultado.ERROR;
            }
        }
    }

    private record Intento(Resultado resultado, boolean reintentar) {}

    /** Un envío; se reintenta solo ante 429, 5xx o una falla de red (D69). */
    private Intento intentar(Map<String, ?> cuerpo) {
        try {
            var pedido = HttpRequest.newBuilder(URI.create(base + "/v1/projects/" + proyecto + "/messages:send"))
                    .timeout(Duration.ofSeconds(10))
                    .header("Authorization", "Bearer " + tokenDeAcceso.get())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(cuerpo)))
                    .build();
            var r = http.send(pedido, HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() == 200) return new Intento(Resultado.ENVIADO, false);
            // 404 UNREGISTERED o 400 con el token mal formado: el celular ya no recibe con ese token.
            if (r.statusCode() == 404 || (r.statusCode() == 400 && r.body().contains("registration"))) {
                return new Intento(Resultado.TOKEN_INVALIDO, false);
            }
            LOG.warn("FCM respondió {}: {}", r.statusCode(), r.body());
            return new Intento(Resultado.ERROR, r.statusCode() == 429 || r.statusCode() >= 500);
        } catch (IOException | RuntimeException e) {
            LOG.warn("No se pudo enviar el push: {}", e.getMessage());
            return new Intento(Resultado.ERROR, true);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Intento(Resultado.ERROR, false);
        }
    }
}
