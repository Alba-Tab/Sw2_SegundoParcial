package bo.transporte.viajes.configuracion;

import bo.transporte.viajes.adaptadores.entrada.web.Problemas;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.ProblemDetail;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import tools.jackson.databind.json.JsonMapper;

/**
 * /health libre; /api/** con JWT de Keycloak (emisor + audiencia "viajes"); roles de realm_access.roles como ROLE_x.
 * P10: sin OIDC_ISSUER los endpoints de negocio responden 503 DEPENDENCIA_NO_DISPONIBLE en lugar de fallar al arrancar.
 */
@Configuration
class SeguridadConfig {

    @Bean
    SecurityFilterChain cadena(HttpSecurity http, SeguridadPropiedades props, JsonMapper json, JwtDecoder decodificador)
            throws Exception {
        http.csrf(c -> c.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .cors(c -> c.configurationSource(cors(props)));
        if (props.issuer() == null || props.issuer().isBlank()) {
            http.authorizeHttpRequests(a -> a.requestMatchers("/health", "/health/**")
                            .permitAll()
                            .anyRequest()
                            .permitAll())
                    .addFilterBefore(
                            (req, res, cadena) -> {
                                String ruta = ((jakarta.servlet.http.HttpServletRequest) req).getRequestURI();
                                if (ruta.startsWith("/api/")) {
                                    escribir(
                                            (HttpServletResponse) res,
                                            json,
                                            Problemas.de(
                                                    "DEPENDENCIA_NO_DISPONIBLE",
                                                    "Identidad no configurada",
                                                    "OIDC_ISSUER no está configurado"),
                                            30);
                                    return;
                                }
                                cadena.doFilter(req, res);
                            },
                            org.springframework.security.web.authentication.AnonymousAuthenticationFilter.class);
            return http.build();
        }
        http.authorizeHttpRequests(a -> a.requestMatchers("/health", "/health/**")
                        .permitAll()
                        .requestMatchers("/api/**")
                        .authenticated()
                        .anyRequest()
                        .denyAll())
                .oauth2ResourceServer(o -> o.jwt(j -> j.decoder(decodificador).jwtAuthenticationConverter(conversor()))
                        .authenticationEntryPoint((req, res, e) -> escribir(
                                res,
                                json,
                                Problemas.de("NO_AUTENTICADO", "No autenticado", "Falta el token o no es válido"),
                                0)))
                .exceptionHandling(e -> e.accessDeniedHandler((req, res, ex) -> escribir(
                        res,
                        json,
                        Problemas.de("SIN_PERMISO", "Sin permiso", "El token no tiene permiso para esta operación"),
                        0)));
        return http.build();
    }

    /**
     * Las llaves se bajan en la primera petición y se cachean (withIssuerLocation consulta Keycloak al arrancar y
     * rompería P10). Se validan igual el emisor, las fechas y la audiencia.
     */
    @Bean
    JwtDecoder decodificador(SeguridadPropiedades props) {
        if (props.issuer() == null || props.issuer().isBlank()) {
            return token -> {
                throw new org.springframework.security.oauth2.jwt.BadJwtException("OIDC_ISSUER no está configurado");
            };
        }
        String issuer = props.issuer().replaceAll("/$", "");
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(issuer + "/protocol/openid-connect/certs")
                .build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(issuer),
                jwt -> jwt.getAudience() != null && jwt.getAudience().contains(props.audiencia())
                        ? OAuth2TokenValidatorResult.success()
                        : OAuth2TokenValidatorResult.failure(
                                new OAuth2Error("invalid_token", "Audiencia incorrecta", null))));
        return decoder;
    }

    static JwtAuthenticationConverter conversor() {
        JwtAuthenticationConverter c = new JwtAuthenticationConverter();
        c.setJwtGrantedAuthoritiesConverter(Seguridad::rolesDelRealm);
        return c;
    }

    private static UrlBasedCorsConfigurationSource cors(SeguridadPropiedades props) {
        CorsConfiguration c = new CorsConfiguration();
        c.setAllowedOrigins(props.corsOrigenes() == null ? List.of() : props.corsOrigenes());
        c.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        c.setAllowedHeaders(
                List.of("Authorization", "Content-Type", "Idempotency-Key", "X-Correlation-Id", "traceparent"));
        c.setExposedHeaders(List.of("Location", "Retry-After", "X-Correlation-Id"));
        UrlBasedCorsConfigurationSource fuente = new UrlBasedCorsConfigurationSource();
        fuente.registerCorsConfiguration("/api/**", c);
        return fuente;
    }

    private static void escribir(HttpServletResponse res, JsonMapper json, ProblemDetail p, int reintentarEn)
            throws IOException {
        res.setStatus(p.getStatus());
        res.setContentType("application/problem+json");
        if (reintentarEn > 0) res.setHeader("Retry-After", String.valueOf(reintentarEn));
        json.writeValue(res.getOutputStream(), p);
    }

    /** Roles de realm_access.roles (000 §8). */
    static final class Seguridad {
        private Seguridad() {}

        @SuppressWarnings("unchecked")
        static Collection<GrantedAuthority> rolesDelRealm(Jwt jwt) {
            Object acceso = jwt.getClaims().get("realm_access");
            if (!(acceso instanceof Map<?, ?> mapa) || !(mapa.get("roles") instanceof Collection<?> roles))
                return List.of();
            return ((Collection<Object>) roles)
                    .stream()
                            .map(r -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + r))
                            .toList();
        }
    }
}
