package bo.transporte.viajes.aplicacion.puerto.salida;

import java.util.UUID;

/**
 * Escribe el atributo {@code clienteId} y asigna el rol {@code cliente} al usuario en Keycloak (spec 001, K4). Las dos
 * operaciones son idempotentes. Lanza {@link IdentidadNoDisponible} si Keycloak no responde.
 */
public interface VinculadorIdentidad {
    void vincular(String sub, UUID clienteId);

    class IdentidadNoDisponible extends RuntimeException {
        public IdentidadNoDisponible(String mensaje, Throwable causa) {
            super(mensaje, causa);
        }
    }
}
