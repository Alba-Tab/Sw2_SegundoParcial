package bo.transporte.viajes.aplicacion.puerto.salida;

/**
 * Deja un evento para publicar, en la misma transacción que el cambio (Outbox, 000 §6). Nunca publica directo al broker.
 *
 * @param tipo nombre del evento, por ejemplo "ViajeConfirmado"
 * @param claveEnrutamiento por ejemplo "viajes.viaje-confirmado.v1"
 * @param datos contenido de {@code datos} del sobre; debe cumplir contratos/eventos
 */
public interface RegistroDeEventos {
    void registrar(String tipo, String claveEnrutamiento, Object datos);
}
