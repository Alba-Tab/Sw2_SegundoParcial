package bo.transporte.viajes.adaptadores.entrada.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import tools.jackson.databind.json.JsonMapper;

/** 000 §4.1: la misma clave sobre otro recurso o de otro usuario no reutiliza la respuesta guardada. */
class HashCuerpoTest {
    final JsonMapper json = JsonMapper.builder().build();
    final Map<String, Object> cuerpo = Map.of("motivo", "El cliente desistió");

    String hash(String ruta, String sub, Object c) {
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(new MockHttpServletRequest("POST", ruta)));
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(sub, "", List.of()));
        return HashCuerpo.de(json, c);
    }

    @AfterEach
    void limpiar() {
        RequestContextHolder.resetRequestAttributes();
        SecurityContextHolder.clearContext();
    }

    @Test
    void elHashCubreRutaUsuarioYCuerpo() {
        String base = hash("/api/v1/servicios/a/cancelacion", "u1", cuerpo);
        assertEquals(base, hash("/api/v1/servicios/a/cancelacion", "u1", Map.of("motivo", "El cliente desistió")));
        assertNotEquals(base, hash("/api/v1/servicios/b/cancelacion", "u1", cuerpo));
        assertNotEquals(base, hash("/api/v1/servicios/a/cancelacion", "u2", cuerpo));
        assertNotEquals(base, hash("/api/v1/servicios/a/cancelacion", "u1", Map.of("motivo", "otro")));
    }
}
