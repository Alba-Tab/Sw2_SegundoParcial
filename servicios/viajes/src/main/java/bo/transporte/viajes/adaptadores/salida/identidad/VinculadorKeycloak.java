package bo.transporte.viajes.adaptadores.salida.identidad;

import bo.transporte.viajes.aplicacion.puerto.salida.VinculadorIdentidad;
import bo.transporte.viajes.configuracion.SeguridadPropiedades;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Vincula al usuario con su cliente en Keycloak con la cuenta de servicio {@code viajes} (FGAP v2, K4, PoC-1):
 * escribe el atributo {@code clienteId} y asigna el rol {@code cliente}. Usa el {@code sub} del token como id del
 * usuario (la búsqueda por nombre no devuelve los miembros de registro-portal). Las dos operaciones son idempotentes.
 */
@Component
class VinculadorKeycloak implements VinculadorIdentidad {
    private final RestClient http;
    private final String base;
    private final String realm;
    private final String secreto;
    private String token;
    private Instant vence = Instant.EPOCH;

    VinculadorKeycloak(SeguridadPropiedades props, @Value("${identidad.secreto:}") String secreto) {
        String issuer = props.issuer() == null ? "" : props.issuer().replaceAll("/$", "");
        int i = issuer.indexOf("/realms/");
        this.base = i < 0 ? "" : issuer.substring(0, i);
        this.realm = i < 0 ? "" : issuer.substring(i + "/realms/".length());
        this.secreto = secreto;
        var fabrica = new SimpleClientHttpRequestFactory();
        fabrica.setConnectTimeout(Duration.ofSeconds(3));
        fabrica.setReadTimeout(Duration.ofSeconds(5));
        this.http = RestClient.builder().requestFactory(fabrica).build();
    }

    @Override
    public void vincular(String sub, UUID clienteId) {
        if (base.isEmpty()) throw new IdentidadNoDisponible("OIDC_ISSUER no está configurado", null);
        try {
            String usuario = base + "/admin/realms/" + realm + "/users/" + sub;
            @SuppressWarnings("unchecked")
            Map<String, Object> rep = http.get()
                    .uri(usuario)
                    .headers(h -> h.setBearerAuth(token()))
                    .retrieve()
                    .body(Map.class);
            Map<String, Object> cambio = new LinkedHashMap<>(rep);
            @SuppressWarnings("unchecked")
            Map<String, Object> atributos =
                    new LinkedHashMap<>((Map<String, Object>) rep.getOrDefault("attributes", Map.of()));
            atributos.put("clienteId", List.of(clienteId.toString()));
            cambio.put("attributes", atributos);
            http.put()
                    .uri(usuario)
                    .headers(h -> h.setBearerAuth(token()))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(cambio)
                    .retrieve()
                    .toBodilessEntity();
            // Keycloak asigna roles por id y viajes no puede leer el catálogo de roles: el id sale de los roles que
            // puede asignarle a este usuario (FGAP solo deja "cliente"). Si no aparece, el usuario ya lo tiene.
            List<Map<String, Object>> disponibles = http.get()
                    .uri(usuario + "/role-mappings/realm/available")
                    .headers(h -> h.setBearerAuth(token()))
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {});
            var cliente = disponibles == null
                    ? null
                    : disponibles.stream()
                            .filter(r -> "cliente".equals(r.get("name")))
                            .findFirst()
                            .orElse(null);
            if (cliente != null) {
                http.post()
                        .uri(usuario + "/role-mappings/realm")
                        .headers(h -> h.setBearerAuth(token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(List.of(Map.of("id", cliente.get("id"), "name", "cliente")))
                        .retrieve()
                        .toBodilessEntity();
            }
        } catch (RestClientException e) {
            throw new IdentidadNoDisponible(e.getMessage(), e);
        }
    }

    /** Token de la cuenta de servicio, renovado 30 s antes de vencer. */
    private synchronized String token() {
        if (token != null && Instant.now().isBefore(vence)) return token;
        var form = new LinkedMultiValueMap<String, String>();
        form.add("grant_type", "client_credentials");
        form.add("client_id", "viajes");
        form.add("client_secret", secreto);
        @SuppressWarnings("unchecked")
        Map<String, Object> r = http.post()
                .uri(base + "/realms/" + realm + "/protocol/openid-connect/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(Map.class);
        token = (String) r.get("access_token");
        vence = Instant.now().plusSeconds(((Number) r.get("expires_in")).longValue() - 30);
        return token;
    }
}
