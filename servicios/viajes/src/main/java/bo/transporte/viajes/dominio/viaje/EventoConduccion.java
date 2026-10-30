package bo.transporte.viajes.dominio.viaje;

import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** Frenada brusca o alerta de fatiga detectada en el celular (spec 005, CU-06). */
public record EventoConduccion(
        UUID eventoId, UUID viajeId, Tipo tipo, BigDecimal magnitudG, double lat, double lng, Instant registradoEn) {
    /** D08: una frenada es brusca desde 0,4 g. */
    public static final BigDecimal FRENADA_MINIMA_G = new BigDecimal("0.4");

    public enum Tipo {
        FRENADA_BRUSCA,
        ALERTA_FATIGA
    }

    public EventoConduccion {
        if (tipo == Tipo.FRENADA_BRUSCA && (magnitudG == null || magnitudG.compareTo(FRENADA_MINIMA_G) < 0)) {
            throw new ErrorDeDominio(
                    "VALIDACION", "magnitudG: una frenada brusca es de 0,4 g o más", Map.of("campo", "magnitudG"));
        }
    }
}
