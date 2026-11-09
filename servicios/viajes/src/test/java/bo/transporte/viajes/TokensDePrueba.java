package bo.transporte.viajes;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/**
 * Reemplaza la validación contra Keycloak en las pruebas: el token es el texto {@code sub~rol1+rol2~clienteId} (solo caracteres válidos en un bearer) y se
 * convierte en un JWT con audiencia viajes. La validación real se prueba contra Keycloak en el compose.
 */
@TestConfiguration(proxyBeanMethods = false)
class TokensDePrueba {

    static String token(String sub, String roles, String clienteId) {
        return sub + "~" + roles.replace(",", "+") + "~" + (clienteId == null ? "" : clienteId);
    }

    @Bean
    @Primary
    JwtDecoder decodificadorDePrueba() {
        return texto -> {
            String[] p = texto.split("~", -1);
            if (p.length != 3) throw new BadJwtException("token de prueba inválido");
            var b = Jwt.withTokenValue(texto)
                    .header("alg", "none")
                    .subject(p[0])
                    .audience(List.of("viajes"))
                    .issuedAt(Instant.now())
                    .expiresAt(Instant.now().plusSeconds(300))
                    .claim(
                            "realm_access",
                            Map.of("roles", p[1].isEmpty() ? List.of() : Arrays.asList(p[1].split("\\+"))));
            if (!p[2].isEmpty()) b.claim("clienteId", p[2]);
            return b.build();
        };
    }
}
