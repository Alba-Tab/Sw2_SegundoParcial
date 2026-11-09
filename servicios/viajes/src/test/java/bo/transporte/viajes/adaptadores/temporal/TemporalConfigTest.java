package bo.transporte.viajes.adaptadores.temporal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** B1: sin temporal.tls.* la conexión va en claro (compose local); con ellas arma mTLS con la CA y el par del cliente. */
class TemporalConfigTest {

    @Test
    void sinVariablesNoArmaTls() throws Exception {
        assertNull(TemporalConfig.opciones("temporal:7233", "", "", "").getSslContext());
    }

    @Test
    void conVariablesArmaMtls(@TempDir Path dir) throws Exception {
        // Un certificado autofirmado sirve de CA y de cliente; la clave sale en PKCS#8 como en certificados.sh.
        var openssl = new ProcessBuilder(
                        "openssl",
                        "req",
                        "-x509",
                        "-newkey",
                        "rsa:2048",
                        "-nodes",
                        "-days",
                        "1",
                        "-subj",
                        "/CN=cliente-viajes",
                        "-keyout",
                        "c.key",
                        "-out",
                        "c.pem")
                .directory(dir.toFile())
                .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                .redirectError(ProcessBuilder.Redirect.DISCARD)
                .start();
        assertEquals(0, openssl.waitFor());
        var pem = dir.resolve("c.pem").toString();
        assertNotNull(TemporalConfig.opciones(
                        "temporal:7233", pem, pem, dir.resolve("c.key").toString())
                .getSslContext());
    }
}
