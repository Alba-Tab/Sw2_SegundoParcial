package bo.transporte.viajes.aplicacion.puerto.salida;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import java.util.Map;
import java.util.UUID;

/** Esquema común de auditoría (000 §9), en la misma transacción que el cambio. */
public interface Auditoria {
    void registrar(
            Solicitante actor, String canal, String accion, String entidad, UUID entidadId, Map<String, Object> datos);
}
