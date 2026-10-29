package bo.transporte.viajes.aplicacion.puerto.salida;

import java.util.Optional;
import java.util.UUID;

/** Autoridad de idempotencia de 000 §4.1 (tabla operacion_idempotente), dentro de la transacción del cambio. */
public interface RegistroIdempotente {
    enum Estado {
        EN_PROCESO,
        COMPLETADA
    }

    record Operacion(UUID clave, String tipo, String hashCuerpo, Estado estado, Integer codigoHttp, Object respuesta) {}

    Optional<Operacion> buscar(UUID clave);

    /** Guarda la operación ya terminada con su respuesta; si la clave ya existe lanza {@link ClaveRepetida}. */
    void guardarCompletada(UUID clave, String tipo, String hashCuerpo, int codigoHttp, Object respuesta);

    class ClaveRepetida extends RuntimeException {
        public ClaveRepetida(UUID clave) {
            super("Clave de idempotencia ya registrada: " + clave);
        }
    }
}
