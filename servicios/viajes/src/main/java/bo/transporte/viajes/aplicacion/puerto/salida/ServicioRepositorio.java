package bo.transporte.viajes.aplicacion.puerto.salida;

import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import bo.transporte.viajes.dominio.viaje.Servicio;
import bo.transporte.viajes.dominio.viaje.Viaje;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Servicios y sus viajes (1:1, D03). El viaje no existe hasta el paso 1 de la saga. */
public interface ServicioRepositorio {
    /** Un servicio con su viaje; {@code viaje} es null antes del paso 1. */
    record ConViaje(Servicio servicio, Viaje viaje) {
        public EstadoViaje estado() {
            return viaje == null ? EstadoViaje.PROGRAMANDO : viaje.estado();
        }
    }

    void guardar(Servicio servicio);

    Optional<Servicio> porId(UUID servicioId);

    Optional<Servicio> porViajeId(UUID viajeId);

    Optional<ConViaje> conViaje(UUID servicioId);

    /** Más nuevos primero; {@code antesDe} es el último servicioId de la página anterior. */
    List<ConViaje> listar(UUID clienteId, EstadoViaje estado, UUID antesDe, int limite);

    void marcarConfirmacionCompleta(UUID servicioId);
}
