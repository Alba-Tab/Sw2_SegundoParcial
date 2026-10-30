package bo.transporte.viajes.aplicacion.puerto.salida;

import java.time.Instant;
import java.util.List;

/** Almacén de objetos para las evidencias (S3 en AWS, RustFS en local): subida por partes con URL firmadas (D40a). */
public interface AlmacenEvidencias {
    record UrlFirmada(int numero, String url, Instant expiraEn) {}

    record Parte(int numero, String etag) {}

    /** Crea la subida por partes y devuelve su uploadId. */
    String iniciar(String llave, String contentType);

    /** URL {@code PUT} firmadas de 15 min, una por parte. */
    List<UrlFirmada> urlsDePartes(String llave, String uploadId, List<Integer> numeros);

    /** Partes que el almacén ya tiene (ListParts). */
    List<Parte> partesSubidas(String llave, String uploadId);

    /** Completa la subida y devuelve el tamaño final del objeto. */
    long completar(String llave, String uploadId, List<Parte> partes);

    /** URL {@code GET} firmada de 5 min. */
    UrlFirmada urlDeDescarga(String llave);

    class NoDisponible extends RuntimeException {
        public NoDisponible(String mensaje, Throwable causa) {
            super(mensaje, causa);
        }
    }

    /** El almacén rechazó las partes (ETag o número que no corresponden). */
    class PartesInvalidas extends RuntimeException {
        public PartesInvalidas(String mensaje, Throwable causa) {
            super(mensaje, causa);
        }
    }
}
