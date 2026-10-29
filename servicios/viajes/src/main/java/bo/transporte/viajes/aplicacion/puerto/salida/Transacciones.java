package bo.transporte.viajes.aplicacion.puerto.salida;

import java.util.function.Supplier;

/** Ejecuta un bloque en una transacción de la base de Viajes: los cambios, el Outbox y la idempotencia van juntos. */
public interface Transacciones {
    <T> T enTransaccion(Supplier<T> bloque);
}
