package bo.transporte.viajes.dominio.viaje;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * La entrega del viaje o el rechazo del receptor (specs 006 y 007): una por viaje. Guarda lo que registró el chofer
 * (posición, distancia al destino, firma y fotos) y, si fue observada, la decisión del despachador.
 */
public record Entrega(
        UUID entregaId,
        UUID viajeId,
        Tipo tipo,
        Instant registradaEn,
        double lat,
        double lng,
        Double precisionMetros,
        double distanciaMetros,
        boolean dentroGeocerca,
        boolean conFirma,
        List<String> razones,
        String nombreReceptor,
        UUID firmaEvidenciaId,
        List<UUID> fotos,
        String observacion,
        String motivo,
        String decision,
        String decididaPor) {
    public enum Tipo {
        ENTREGA,
        RECHAZO_RECEPTOR
    }

    public Entrega conDecision(String decision, String decididaPor, String motivo) {
        return new Entrega(
                entregaId,
                viajeId,
                tipo,
                registradaEn,
                lat,
                lng,
                precisionMetros,
                distanciaMetros,
                dentroGeocerca,
                conFirma,
                razones,
                nombreReceptor,
                firmaEvidenciaId,
                fotos,
                observacion,
                motivo != null ? motivo : this.motivo,
                decision,
                decididaPor);
    }
}
