package bo.transporte.viajes.dominio.viaje;

import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;

/** Un punto de la cola GPS del celular (spec 005, propuesta 4.4). {@code seq} crece por dispositivo y viaje. */
public record PuntoGps(
        long seq, Instant registradaEn, double lat, double lng, double velocidadKmh, Double precisionMetros) {
    public static final int MAXIMO_POR_LOTE = 100;
    /** Propuesta 4.4: cada punto vence en DynamoDB 90 días después de registrado (TTL {@code expiraEn}). */
    public static final Duration RETENCION = Duration.ofDays(90);

    private static final Duration DESFASE_DE_RELOJ = Duration.ofMinutes(2);
    private static final Duration ANTES_DEL_INICIO = Duration.ofMinutes(10);

    /**
     * D56 y D57: 1 a 100 puntos sin repetir {@code seq}; cada uno a lo sumo 2 min en el futuro y no más de 10 min antes
     * del inicio del viaje.
     */
    public static void validarLote(List<PuntoGps> puntos, Instant iniciadoEn, Instant ahora) {
        if (puntos.isEmpty() || puntos.size() > MAXIMO_POR_LOTE) {
            throw invalido("puntos", "de 1 a " + MAXIMO_POR_LOTE + " puntos por lote");
        }
        var vistos = new HashSet<Long>();
        for (var p : puntos) {
            if (!vistos.add(p.seq())) throw invalido("puntos", "seq " + p.seq() + " repetido en el lote");
            if (p.registradaEn().isAfter(ahora.plus(DESFASE_DE_RELOJ))) {
                throw invalido("puntos", "seq " + p.seq() + ": registradaEn está en el futuro");
            }
            if (iniciadoEn != null && p.registradaEn().isBefore(iniciadoEn.minus(ANTES_DEL_INICIO))) {
                throw invalido("puntos", "seq " + p.seq() + ": registradaEn es anterior al inicio del viaje");
            }
        }
    }

    /** El punto más nuevo del lote (por hora y, si empatan, por seq). */
    public static PuntoGps masNuevo(List<PuntoGps> puntos) {
        return puntos.stream()
                .max((a, b) -> a.registradaEn().equals(b.registradaEn())
                        ? Long.compare(a.seq(), b.seq())
                        : a.registradaEn().compareTo(b.registradaEn()))
                .orElseThrow();
    }

    private static ErrorDeDominio invalido(String campo, String mensaje) {
        return new ErrorDeDominio("VALIDACION", campo + ": " + mensaje, Map.of("campo", campo));
    }
}
