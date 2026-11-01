package bo.transporte.viajes.aplicacion.puerto.salida;

import bo.transporte.viajes.dominio.ruta.Ruta;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RutaRepositorio {
    List<Ruta> activas();

    /** Activas e inactivas, por nombre (gestión de rutas, G4). */
    List<Ruta> todas();

    /** La ruta con su fila bloqueada hasta el fin de la transacción (000 §9), para editarla. */
    Optional<Ruta> paraActualizar(UUID rutaId);

    /** Inserta la ruta o reemplaza la que tiene ese id. */
    void guardar(Ruta ruta);

    Optional<Ruta> porId(UUID rutaId);

    /** Las rutas de esos ids, activas o no, en una consulta. */
    List<Ruta> porIds(Collection<UUID> rutaIds);
}
