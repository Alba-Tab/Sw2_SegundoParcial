package bo.transporte.viajes.dominio.comun;

import java.security.SecureRandom;
import java.util.UUID;

/** Genera UUIDv7 (RFC 9562): 48 bits de milisegundos y el resto aleatorio. Los ids ordenan por fecha (000 §1). */
public final class Uuid7 {
    private static final SecureRandom AZAR = new SecureRandom();

    private Uuid7() {}

    public static UUID nuevo() {
        long ms = System.currentTimeMillis();
        long alto = (ms << 16) | 0x7000L | (AZAR.nextInt() & 0x0FFFL);
        long bajo = (AZAR.nextLong() & 0x3FFFFFFFFFFFFFFFL) | 0x8000000000000000L;
        return new UUID(alto, bajo);
    }
}
