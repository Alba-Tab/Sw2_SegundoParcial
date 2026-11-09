package bo.transporte.viajes.dominio.viaje;

import bo.transporte.viajes.dominio.comun.Monto;
import bo.transporte.viajes.dominio.comun.TipoCarga;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** Lo que el viaje recibe en el pivote (paso 4): datos de la cotización (Finanzas) y la unidad y chofer (Flota). */
public record Asignacion(
        UUID rutaId,
        TipoCarga tipoCarga,
        BigDecimal toneladas,
        LocalDate fechaViaje,
        Monto monto,
        UUID reservaUnidadId,
        UUID tractoId,
        UUID remolqueId,
        String placa,
        UUID choferId,
        String choferNombre,
        String choferUsuarioSub) {}
