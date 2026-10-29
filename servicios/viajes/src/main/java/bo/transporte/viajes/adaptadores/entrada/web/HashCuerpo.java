package bo.transporte.viajes.adaptadores.entrada.web;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import tools.jackson.databind.json.JsonMapper;

/** SHA-256 del cuerpo ya leído y vuelto a serializar (000 §4.1): espacios u orden de campos no cambian el hash. */
final class HashCuerpo {
    private HashCuerpo() {}

    static String de(JsonMapper json, Object cuerpo) {
        try {
            var canonico = json.writer()
                    .with(tools.jackson.databind.SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
                    .writeValueAsBytes(json.valueToTree(cuerpo));
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonico));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
