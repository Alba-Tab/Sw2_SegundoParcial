package bo.transporte.viajes.aplicacion.puerto.salida;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** El celular de cada chofer (spec 005; el token push lo usa T7.8, D45). */
public interface DispositivoRepositorio {
    enum Plataforma {
        ANDROID,
        IOS
    }

    record Dispositivo(
            UUID dispositivoId, String usuarioSub, Plataforma plataforma, String tokenPush, Instant actualizadoEn) {}

    /** Reemplazo completo: el mismo celular puede pasar a otro chofer (se cambia el dueño). */
    void guardar(Dispositivo dispositivo);

    Optional<Dispositivo> porId(UUID dispositivoId);

    /** Los tokens push de Android del chofer (uno por celular). */
    List<String> tokensPush(String usuarioSub);

    void olvidarToken(String tokenPush);

    /** Marca el evento como avisado; false si otra instancia ya lo tomó (idempotente por eventId, D45). */
    boolean registrarAviso(UUID eventoId, String tipo, String resultado);

    void actualizarAviso(UUID eventoId, String resultado);
}
