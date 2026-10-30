package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.puerto.salida.Inbox;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** inbox_eventos con el eventId como llave (000 §6), en la transacción del efecto. */
@Component
class InboxJdbc implements Inbox {
    private final JdbcClient jdbc;

    InboxJdbc(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean registrar(UUID eventId, String tipo) {
        return jdbc.sql("INSERT INTO inbox_eventos (event_id, tipo) VALUES (:id, :tipo) ON CONFLICT DO NOTHING")
                        .param("id", eventId)
                        .param("tipo", tipo)
                        .update()
                == 1;
    }
}
