package bo.transporte.viajes.aplicacion.puerto.salida;

import bo.transporte.viajes.dominio.ruta.Ruta;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RutaRepositorio {
    List<Ruta> activas();

    Optional<Ruta> porId(UUID rutaId);

    /** Las rutas de esos ids, activas o no, en una consulta. */
    List<Ruta> porIds(Collection<UUID> rutaIds);
}
