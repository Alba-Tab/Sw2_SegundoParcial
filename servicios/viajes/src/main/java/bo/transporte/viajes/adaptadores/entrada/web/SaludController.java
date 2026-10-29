package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.adaptadores.entrada.web.api.SaludApi;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.SaludDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.SaludDto.EstadoEnum;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.SaludDto.InnerEnum;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/**
 * GET /health (vivo) y GET /health/ready (dependencias), sin autenticación (000 §4). Implementa la interfaz generada
 * desde contratos/openapi/viajes.yaml: las rutas y la forma de la respuesta salen del contrato. No dependen de
 * Keycloak (P10): el servicio arranca y responde aunque el realm todavía no exista en la nube.
 */
@RestController
class SaludController implements SaludApi {
    private final DataSource baseDeDatos;
    private final ConnectionFactory rabbit;

    SaludController(DataSource baseDeDatos, ConnectionFactory rabbit) {
        this.baseDeDatos = baseDeDatos;
        this.rabbit = rabbit;
    }

    @Override
    public ResponseEntity<SaludDto> salud() {
        // El DTO generado inicializa dependencias vacío; en /health no aplica (contrato: es opcional).
        return ResponseEntity.ok(new SaludDto().estado(EstadoEnum.UP).dependencias(null));
    }

    @Override
    public ResponseEntity<SaludDto> saludLista() {
        Map<String, InnerEnum> dependencias = new LinkedHashMap<>();
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
        boolean arriba = !dependencias.containsValue(InnerEnum.DOWN);
        SaludDto cuerpo =
                new SaludDto().estado(arriba ? EstadoEnum.UP : EstadoEnum.DOWN).dependencias(dependencias);
        return ResponseEntity.status(arriba ? 200 : 503).body(cuerpo);
    }

    private interface Chequeo {
        boolean ok() throws Exception;
    }

    private static InnerEnum estado(Chequeo chequeo) {
        try {
            return chequeo.ok() ? InnerEnum.UP : InnerEnum.DOWN;
        } catch (Exception e) {
            return InnerEnum.DOWN;
        }
    }
}
