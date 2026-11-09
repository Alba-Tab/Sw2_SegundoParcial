package bo.transporte.viajes.adaptadores.entrada.web;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import tools.jackson.databind.json.JsonMapper;

/**
 * SHA-256 del método, la ruta, el {@code sub} y el cuerpo ya leído y vuelto a serializar (000 §4.1): espacios u orden
 * de campos no cambian el hash, y la misma clave sobre otro recurso o de otro usuario no devuelve la respuesta ajena.
 */
final class HashCuerpo {
    private HashCuerpo() {}

    static String de(JsonMapper json, Object cuerpo) {
        try {
            var canonico = json.writer()
                    .with(tools.jackson.databind.SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
                    .writeValueAsBytes(json.valueToTree(cuerpo));
            var digest = MessageDigest.getInstance("SHA-256");
            digest.update(alcance().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest.digest(canonico));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String alcance() {
        String operacion = RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes a
                ? a.getRequest().getMethod() + " " + a.getRequest().getRequestURI()
                : "";
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return operacion + "\n" + (auth == null ? "" : auth.getName()) + "\n";
    }
}
