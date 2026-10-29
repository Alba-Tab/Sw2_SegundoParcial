package bo.transporte.viajes.configuracion;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param issuer emisor de Keycloak (OIDC_ISSUER); vacío = endpoints de negocio responden 503 (P10)
 * @param audiencia el token debe traer este valor en aud (000 §8)
 * @param corsOrigenes CORS_ORIGENES separados por coma
 */
@ConfigurationProperties("seguridad")
public record SeguridadPropiedades(String issuer, String audiencia, List<String> corsOrigenes) {}
