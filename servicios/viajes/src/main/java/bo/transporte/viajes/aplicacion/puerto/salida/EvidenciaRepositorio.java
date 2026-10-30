package bo.transporte.viajes.aplicacion.puerto.salida;

import bo.transporte.viajes.dominio.viaje.Evidencia;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EvidenciaRepositorio {
    Optional<Evidencia> porId(UUID evidenciaId);

    List<Evidencia> porIds(List<UUID> evidenciaIds);

    /** false si ya existía una con ese id. */
    boolean insertar(Evidencia evidencia);

    void marcarCompleta(UUID evidenciaId);
}
