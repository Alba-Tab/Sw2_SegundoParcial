package bo.transporte.viajes.adaptadores.entrada.web;

import java.util.LinkedHashMap;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * GET /health (vivo) y GET /health/ready (dependencias), sin autenticación (000 §4). No dependen de Keycloak (P10):
 * el servicio arranca y responde aunque el realm todavía no exista en la nube.
 */
@RestController
class SaludController {
    private final DataSource baseDeDatos;
    private final ConnectionFactory rabbit;

    SaludController(DataSource baseDeDatos, ConnectionFactory rabbit) {
        this.baseDeDatos = baseDeDatos;
        this.rabbit = rabbit;
    }

    @GetMapping("/health")
    Map<String, Object> vivo() {
        return Map.of("estado", "UP");
    }

    @GetMapping("/health/ready")
    ResponseEntity<Map<String, Object>> listo() {
        Map<String, String> dependencias = new LinkedHashMap<>();
        dependencias.put("postgres", estado(() -> {
            try (var c = baseDeDatos.getConnection()) {
                return c.isValid(2);
            }
        }));
        dependencias.put("rabbitmq", estado(() -> {
            try (var c = rabbit.createConnection()) {
                return c.isOpen();
            }
        }));
        boolean arriba = !dependencias.containsValue("DOWN");
        Map<String, Object> cuerpo = Map.of("estado", arriba ? "UP" : "DOWN", "dependencias", dependencias);
        return ResponseEntity.status(arriba ? 200 : 503).body(cuerpo);
    }

    private interface Chequeo {
        boolean ok() throws Exception;
    }

    private static String estado(Chequeo chequeo) {
        try {
            return chequeo.ok() ? "UP" : "DOWN";
        } catch (Exception e) {
            return "DOWN";
        }
    }
}
