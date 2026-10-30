package bo.transporte.viajes.configuracion;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

class SeguridadConfigTest {
    private static Jwt token(Map<String, Object> claims) {
        var b = Jwt.withTokenValue("t")
                .header("alg", "RS256")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60));
        claims.forEach(b::claim);
        return b.build();
    }

    @Test
    void rolesDelRealmComoAuthorities() {
        var roles = SeguridadConfig.Seguridad.rolesDelRealm(
                        token(Map.of("realm_access", Map.of("roles", List.of("gerente", "comercial")))))
                .stream()
                .map(GrantedAuthority::getAuthority)
                .sorted()
                .toList();
        assertEquals(List.of("ROLE_comercial", "ROLE_gerente"), roles);
        assertTrue(SeguridadConfig.Seguridad.rolesDelRealm(token(Map.of("sub", "x")))
                .isEmpty());
    }

    @Test
    void unTokenDeOtraAudienciaNoSirve() {
        var validador = SeguridadConfig.audiencia("viajes");
        assertFalse(validador
                .validate(token(Map.of("aud", List.of("flota"))))
                .getErrors()
                .isEmpty());
        assertFalse(validador.validate(token(Map.of("sub", "x"))).getErrors().isEmpty());
        assertTrue(validador
                .validate(token(Map.of("aud", List.of("flota", "viajes"))))
                .getErrors()
                .isEmpty());
    }
}
