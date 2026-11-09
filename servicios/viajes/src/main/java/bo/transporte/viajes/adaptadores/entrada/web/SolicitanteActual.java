package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/** El solicitante de la petición en curso, a partir del JWT ya validado (000 §8). */
final class SolicitanteActual {
    private SolicitanteActual() {}

    static Solicitante obtener() {
        var auth = (JwtAuthenticationToken) SecurityContextHolder.getContext().getAuthentication();
        Set<String> roles = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(a -> a.startsWith("ROLE_"))
                .map(a -> a.substring(5))
                .collect(Collectors.toUnmodifiableSet());
        String clienteId = auth.getToken().getClaimAsString("clienteId");
        return new Solicitante(
                auth.getToken().getSubject(), roles, clienteId == null ? null : UUID.fromString(clienteId));
    }
}
