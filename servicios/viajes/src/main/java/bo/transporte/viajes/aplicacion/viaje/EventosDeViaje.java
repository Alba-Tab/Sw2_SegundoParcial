package bo.transporte.viajes.aplicacion.viaje;

import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import bo.transporte.viajes.dominio.viaje.Viaje;
import java.util.LinkedHashMap;
import java.util.Map;

/** Datos de los eventos del viaje según contratos/eventos/viajes. */
public final class EventosDeViaje {
    private EventosDeViaje() {}

    /**
     * ViajeCancelado.v1#/properties/datos. {@code origen} es SAGA (compensación o intervención, D18) o USUARIO (spec 004,
     * con {@code canceladoPor}).
     */
    public static Map<String, Object> cancelado(Viaje v, EstadoViaje anterior, String origen, String canceladoPor) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("servicioId", v.servicioId().toString());
        m.put("viajeId", v.viajeId().toString());
        m.put("clienteId", v.clienteId().toString());
        m.put("motivo", v.motivo());
        if (v.detalle() != null)
            m.put("detalle", v.detalle().length() > 600 ? v.detalle().substring(0, 600) : v.detalle());
        m.put("origen", origen);
        if (canceladoPor != null) m.put("canceladoPor", canceladoPor);
        m.put("estadoAnterior", anterior.name());
        if (v.asignacion() != null) m.put("choferUsuarioSub", v.asignacion().choferUsuarioSub());
        return m;
    }
}
