package bo.transporte.viajes.aplicacion.comun;

import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Una escritura síncrona con {@code Idempotency-Key} (000 §4.1): en una sola transacción, el cambio (con su Outbox y
 * su auditoría) y la operación ya COMPLETADA con su respuesta. Un reenvío con la misma clave y el mismo cuerpo recibe
 * la respuesta guardada; con otro cuerpo, IDEMPOTENCIA_CUERPO_DISTINTO.
 */
public class OperacionIdempotente {
    public record Resultado<T>(T respuesta, int codigoHttp) {}

    private final RegistroIdempotente idempotencia;
    private final Transacciones tx;

    public OperacionIdempotente(RegistroIdempotente idempotencia, Transacciones tx) {
        this.idempotencia = idempotencia;
        this.tx = tx;
    }

    public <T> Resultado<T> ejecutar(
            String operacion, UUID clave, String hashCuerpo, int codigoHttp, Supplier<T> cambio) {
        try {
            return tx.enTransaccion(() -> {
                var previa = idempotencia.buscar(clave);
                if (previa.isPresent()) return guardada(previa.get(), operacion, hashCuerpo);
                T respuesta = cambio.get();
                idempotencia.guardarCompletada(clave, operacion, hashCuerpo, codigoHttp, respuesta);
                return new Resultado<>(respuesta, codigoHttp);
            });
        } catch (RegistroIdempotente.ClaveRepetida e) {
            // Otra petición con la misma clave ganó la carrera: se responde lo que ella guardó.
            return tx.enTransaccion(() -> guardada(idempotencia.buscar(clave).orElseThrow(), operacion, hashCuerpo));
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> Resultado<T> guardada(RegistroIdempotente.Operacion op, String operacion, String hashCuerpo) {
        if (!op.hashCuerpo().equals(hashCuerpo) || !operacion.equals(op.tipo())) {
            throw new ErrorDeDominio("IDEMPOTENCIA_CUERPO_DISTINTO", "La clave ya se usó con otro cuerpo");
        }
        return new Resultado<>((T) op.respuesta(), op.codigoHttp());
    }
}
