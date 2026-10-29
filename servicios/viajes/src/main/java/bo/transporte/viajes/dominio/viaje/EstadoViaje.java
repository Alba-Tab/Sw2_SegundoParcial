package bo.transporte.viajes.dominio.viaje;

import java.util.Map;
import java.util.Set;

/** Máquina de estados del Viaje (spec 003, tabla "todas las specs"). Otra transición es 409 CONFLICTO_ESTADO. */
public enum EstadoViaje {
    PROGRAMANDO,
    CONFIRMADO,
    EN_RUTA,
    ENTREGADO,
    ENTREGA_OBSERVADA,
    ENTREGA_RECHAZADA,
    CERRADO,
    CANCELADO,
    REQUIERE_INTERVENCION;

    private static final Map<EstadoViaje, Set<EstadoViaje>> SIGUIENTES = Map.of(
            PROGRAMANDO, Set.of(CONFIRMADO, CANCELADO, REQUIERE_INTERVENCION),
            REQUIERE_INTERVENCION, Set.of(CANCELADO),
            CONFIRMADO, Set.of(CANCELADO, EN_RUTA),
            EN_RUTA, Set.of(ENTREGADO, ENTREGA_OBSERVADA, ENTREGA_RECHAZADA),
            ENTREGA_OBSERVADA, Set.of(ENTREGADO, ENTREGA_RECHAZADA),
            ENTREGADO, Set.of(CERRADO));

    public boolean puedePasarA(EstadoViaje destino) {
        return SIGUIENTES.getOrDefault(this, Set.of()).contains(destino);
    }
}
