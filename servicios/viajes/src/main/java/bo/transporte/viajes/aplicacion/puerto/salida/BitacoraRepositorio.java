package bo.transporte.viajes.aplicacion.puerto.salida;

import bo.transporte.viajes.dominio.viaje.EventoConduccion;
import bo.transporte.viajes.dominio.viaje.Hito;
import java.util.List;
import java.util.UUID;

/** Hitos y eventos de conducción del viaje (spec 005). */
public interface BitacoraRepositorio {
    /** false si ese {@code hitoId} ya existía. */
    boolean insertarHito(Hito hito);

    /** Del más nuevo al más viejo; con {@code texto}, solo los que lo contienen (sin distinguir mayúsculas). */
    List<Hito> hitos(UUID viajeId, String texto, int limite);

    /** false si ese {@code eventoId} ya existía. */
    boolean insertarEvento(EventoConduccion evento);
}
