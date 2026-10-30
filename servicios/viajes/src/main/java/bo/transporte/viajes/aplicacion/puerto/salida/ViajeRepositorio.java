package bo.transporte.viajes.aplicacion.puerto.salida;

import bo.transporte.viajes.dominio.viaje.Viaje;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ViajeRepositorio {
    /** Inserta el viaje si no existe; false si ya estaba (reintento de la actividad). */
    boolean insertarSiNoExiste(Viaje viaje);

    /** Lee el viaje bloqueando su fila hasta el fin de la transacción. */
    Optional<Viaje> paraActualizar(UUID viajeId);

    void actualizar(Viaje viaje);

    Optional<Viaje> porId(UUID viajeId);

    /** D11: si el chofer ya tiene otro viaje EN_RUTA. */
    boolean otroEnRuta(String choferUsuarioSub, UUID excepto);

    /** Spec 005 (D50): sus viajes CONFIRMADO, EN_RUTA o ENTREGA_OBSERVADA y los que cambiaron desde la fecha dada. */
    List<Viaje> deChofer(String choferUsuarioSub, Instant terminadosDesde);
}
