package bo.transporte.viajes.aplicacion.puerto.salida;

import bo.transporte.viajes.dominio.viaje.Entrega;
import java.util.Optional;
import java.util.UUID;

public interface EntregaRepositorio {
    Optional<Entrega> delViaje(UUID viajeId);

    void insertar(Entrega entrega);

    void guardarDecision(Entrega entrega);
}
