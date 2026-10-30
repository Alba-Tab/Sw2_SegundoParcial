package bo.transporte.viajes.aplicacion.viaje;

import bo.transporte.viajes.aplicacion.puerto.salida.Inbox;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.aplicacion.puerto.salida.ViajeRepositorio;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Consumidor de FacturaEmitida (spec 006, paso 9): ENTREGADO → CERRADO con el id y el número de la factura, en la
 * misma transacción que el Inbox. Un evento sobre un viaje ya CERRADO (o repetido) no cambia nada.
 */
public class CierreDeViaje {
    private static final Logger LOG = LoggerFactory.getLogger(CierreDeViaje.class);
    private final ViajeRepositorio viajes;
    private final Inbox inbox;
    private final Transacciones tx;

    public CierreDeViaje(ViajeRepositorio viajes, Inbox inbox, Transacciones tx) {
        this.viajes = viajes;
        this.inbox = inbox;
        this.tx = tx;
    }

    /** @return false si el evento ya se había procesado */
    public boolean facturaEmitida(UUID eventId, UUID viajeId, UUID facturaId, String numero) {
        return tx.enTransaccion(() -> {
            if (!inbox.registrar(eventId, "FacturaEmitida")) return false;
            var v = viajes.paraActualizar(viajeId).orElse(null);
            if (v == null || v.estado() == EstadoViaje.CERRADO) return true;
            if (v.estado() != EstadoViaje.ENTREGADO) {
                LOG.warn("FacturaEmitida {} sobre el viaje {} en {}: se ignora", numero, viajeId, v.estado());
                return true;
            }
            v.cerrar(facturaId, numero);
            viajes.actualizar(v);
            return true;
        });
    }
}
