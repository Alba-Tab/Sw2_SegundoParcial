package bo.transporte.viajes.dominio.viaje;

import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.util.EnumSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Foto o firma del viaje subida por partes a S3 (spec 006, D40a). SUBIENDO → COMPLETA. La llave en S3 es
 * {@code viajes/{viajeId}/evidencias/{evidenciaId}}.
 */
public record Evidencia(
        UUID evidenciaId,
        UUID viajeId,
        Tipo tipo,
        String contentType,
        long tamanoBytes,
        String uploadId,
        boolean completa) {
    public static final long TAMANO_PARTE = 5L * 1024 * 1024;
    public static final long TAMANO_MAXIMO = 15L * 1024 * 1024;

    public enum Tipo {
        FOTO_ENTREGA,
        FIRMA,
        FOTO_RECHAZO,
        RECIBO_COMBUSTIBLE
    }

    /** RECIBO_COMBUSTIBLE se puede sincronizar después de la entrega (spec 009); las de entrega, solo en ruta. */
    private static final Set<EstadoViaje> ESTADOS_RECIBO = EnumSet.of(
            EstadoViaje.CONFIRMADO,
            EstadoViaje.EN_RUTA,
            EstadoViaje.ENTREGA_OBSERVADA,
            EstadoViaje.ENTREGADO,
            EstadoViaje.CERRADO,
            EstadoViaje.ENTREGA_RECHAZADA);

    public Evidencia {
        Objects.requireNonNull(evidenciaId);
        Objects.requireNonNull(viajeId);
        Objects.requireNonNull(tipo);
        if (!"image/jpeg".equals(contentType) && !"image/png".equals(contentType)) {
            throw new ErrorDeDominio(
                    "VALIDACION", "contentType: solo image/jpeg o image/png", Map.of("campo", "contentType"));
        }
        if (tamanoBytes < 1 || tamanoBytes > TAMANO_MAXIMO) {
            throw new ErrorDeDominio("VALIDACION", "tamanoBytes: de 1 B a 15 MB", Map.of("campo", "tamanoBytes"));
        }
    }

    public static void exigirEstado(Tipo tipo, EstadoViaje estado) {
        boolean puede =
                tipo == Tipo.RECIBO_COMBUSTIBLE ? ESTADOS_RECIBO.contains(estado) : estado == EstadoViaje.EN_RUTA;
        if (!puede) {
            throw new ErrorDeDominio(
                    "CONFLICTO_ESTADO", "Con el viaje " + estado + " no se sube una evidencia " + tipo);
        }
    }

    public String llave() {
        return "viajes/" + viajeId + "/evidencias/" + evidenciaId;
    }

    /** Partes de 5 MB; la última puede ser menor (mínimo de S3 para las demás). */
    public int numeroDePartes() {
        return (int) ((tamanoBytes + TAMANO_PARTE - 1) / TAMANO_PARTE);
    }

    public boolean mismosDatos(UUID viajeId, Tipo tipo, String contentType, long tamanoBytes) {
        return this.viajeId.equals(viajeId)
                && this.tipo == tipo
                && this.contentType.equals(contentType)
                && this.tamanoBytes == tamanoBytes;
    }
}
