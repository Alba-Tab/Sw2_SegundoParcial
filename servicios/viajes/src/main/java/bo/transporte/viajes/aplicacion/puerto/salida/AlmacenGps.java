package bo.transporte.viajes.aplicacion.puerto.salida;

import bo.transporte.viajes.dominio.viaje.PuntoGps;
import java.util.List;
import java.util.OptionalLong;
import java.util.UUID;

/**
 * El recorrido en DynamoDB (propuesta 4.4): {@code gps_puntos} con llave {@code viajeId} + {@code ts#seq} y
 * {@code sync_cursor} con llave {@code dispositivoId} + {@code viajeId} (D55).
 */
public interface AlmacenGps {
    record PuntoGuardado(UUID dispositivoId, PuntoGps punto) {}

    record Pagina(List<PuntoGuardado> items, String siguienteCursor) {}

    /**
     * Escribe el lote en grupos de 25 reintentando los {@code UnprocessedItems}; si siguen pendientes lanza
     * {@link SinCapacidad}. Reescribir el mismo punto deja el mismo elemento (la llave es la autoridad, 000 §4.1).
     */
    void escribir(UUID viajeId, UUID dispositivoId, List<PuntoGps> puntos);

    Pagina recorrido(UUID viajeId, String cursor, int limite);

    /** Escritura condicional: solo si {@code seq} es mayor que el guardado. */
    void avanzarCursor(UUID dispositivoId, UUID viajeId, long seq);

    OptionalLong cursor(UUID dispositivoId, UUID viajeId);

    /** DynamoDB siguió con *throttling* después de los reintentos (FO4): el cliente reintenta más tarde. */
    class SinCapacidad extends RuntimeException {
        public SinCapacidad(String mensaje) {
            super(mensaje);
        }
    }
}
