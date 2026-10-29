package bo.transporte.viajes.aplicacion.comun;

import java.util.Set;
import java.util.UUID;

/** Quién hace la petición, tomado del token (000 §8): {@code sub}, roles del realm y {@code clienteId} si es cliente. */
public record Solicitante(String sub, Set<String> roles, UUID clienteId) {
    public static final Set<String> ROLES_INTERNOS =
            Set.of("chofer", "despachador", "jefe_flota", "administracion", "gerente", "comercial", "agente_lectura");

    public boolean tiene(String rol) {
        return roles.contains(rol);
    }

    public boolean tieneAlguno(Set<String> esperados) {
        return roles.stream().anyMatch(esperados::contains);
    }
}
