package bo.transporte.viajes.aplicacion.puerto.salida;

import bo.transporte.viajes.dominio.viaje.Viaje;
import java.util.Optional;
import java.util.UUID;

public interface ViajeRepositorio {
    /** Inserta el viaje si no existe; false si ya estaba (reintento de la actividad). */
    boolean insertarSiNoExiste(Viaje viaje);

    /** Lee el viaje bloqueando su fila hasta el fin de la transacción. */
    Optional<Viaje> paraActualizar(UUID viajeId);

    void actualizar(Viaje viaje);
}
