package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
class TransaccionesSpring implements Transacciones {
    private final TransactionTemplate plantilla;

    TransaccionesSpring(TransactionTemplate plantilla) {
        this.plantilla = plantilla;
    }

    @Override
    public <T> T enTransaccion(Supplier<T> bloque) {
        return plantilla.execute(estado -> bloque.get());
    }
}
