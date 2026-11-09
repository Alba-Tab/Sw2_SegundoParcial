package bo.transporte.viajes.aplicacion.puerto.salida;

import java.util.UUID;

/** Inbox (000 §6): registra el eventId en la transacción en curso; false si ya se había procesado. */
public interface Inbox {
    boolean registrar(UUID eventId, String tipo);
}
