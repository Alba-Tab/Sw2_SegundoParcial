package bo.transporte.viajes.aplicacion.puerto.salida;

import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** {@code ultima_posicion} en PostgreSQL: lo que lee el mapa en vivo (spec 005, paso 9). */
public interface UltimaPosicionRepositorio {
    record UltimaPosicion(double lat, double lng, double velocidadKmh, Instant registradaEn) {}

    /** Guarda la posición solo si es más nueva que la actual; true si avanzó. */
    boolean avanzar(UUID viajeId, UUID dispositivoId, UltimaPosicion posicion);

    Optional<UltimaPosicion> de(UUID viajeId);

    Map<UUID, UltimaPosicion> de(Collection<UUID> viajes);
}
