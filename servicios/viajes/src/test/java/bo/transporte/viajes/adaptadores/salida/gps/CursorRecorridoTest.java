package bo.transporte.viajes.adaptadores.salida.gps;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.Test;

/** Un cursor alterado de GET /viajes/{id}/recorrido responde 400 VALIDACION y no llega a DynamoDB. */
class CursorRecorridoTest {
    static String cursor(String tsSeq) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(tsSeq.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void aceptaElCursorQueEmiteYRechazaLoDemas() {
        assertEquals(
                "2026-11-03T12:10:30Z#001042", AlmacenGpsDynamo.desdeCursor(cursor("2026-11-03T12:10:30Z#001042")));
        for (String malo : new String[] {"%%%", cursor("hola"), cursor("2026-11-03T12:10:30Z#1; DROP")}) {
            var e = assertThrows(ErrorDeDominio.class, () -> AlmacenGpsDynamo.desdeCursor(malo));
            assertEquals("VALIDACION", e.codigo());
        }
    }
}
