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

    /**
     * Spec 005: GPS, hitos y eventos de conducción se aceptan en ruta y también después de la entrega (llegan tarde
     * por falta de señal). Antes de salir o cancelado, no.
     */
    public boolean aceptaRegistrosDeRuta() {
        return this == EN_RUTA
                || this == ENTREGA_OBSERVADA
                || this == ENTREGADO
                || this == CERRADO
                || this == ENTREGA_RECHAZADA;
    }
}
