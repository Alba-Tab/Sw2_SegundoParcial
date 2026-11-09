package bo.transporte.viajes.aplicacion.viaje;

import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import java.util.List;
import java.util.UUID;

/** Respuesta de registrar la entrega o el rechazo; también es la respuesta guardada para los reenvíos. */
public record ResultadoEntrega(
        UUID viajeId,
        UUID entregaId,
        EstadoViaje estado,
        boolean dentroGeocerca,
        double distanciaMetros,
        boolean conFirma,
        List<String> razones) {}
