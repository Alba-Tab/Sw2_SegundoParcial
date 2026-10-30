package bo.transporte.viajes.dominio.viaje;

import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** Una entrada de la bitácora del viaje (spec 005, CU-06). El audio nunca sale del celular: solo el texto (D53). */
public record Hito(
        UUID hitoId,
        UUID viajeId,
        Tipo tipo,
        String descripcion,
        double lat,
        double lng,
        Instant registradoEn,
        Origen origen) {
    public enum Tipo {
        BLOQUEO,
        PARADA,
        PUNTO_CONTROL,
        FALLA_MECANICA,
        OTRO
    }

    public enum Origen {
        VOZ,
        TEXTO
    }

    public Hito {
        descripcion = descripcion == null ? "" : descripcion.strip();
        if (descripcion.length() < 3 || descripcion.length() > 500) {
            throw new ErrorDeDominio(
                    "VALIDACION", "descripcion: de 3 a 500 caracteres", Map.of("campo", "descripcion"));
        }
    }
}
