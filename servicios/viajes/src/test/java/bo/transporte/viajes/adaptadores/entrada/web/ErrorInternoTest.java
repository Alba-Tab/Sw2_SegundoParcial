package bo.transporte.viajes.adaptadores.entrada.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;
import tools.jackson.databind.json.JsonMapper;

/** 000 §5: un error inesperado es 500 ERROR_INTERNO, nunca el 503 de una dependencia caída ni el mensaje interno. */
class ErrorInternoTest {
    @Test
    void unErrorInesperadoEs500ErrorInterno() {
        var filtro = new LimiteCuerpoFiltro(
                DataSize.ofKilobytes(256), JsonMapper.builder().build());
        var p = new ManejadorDeProblemas(filtro).inesperado(new IllegalStateException("tabla viaje: columna rota"));
        assertEquals(500, p.getStatus());
        assertEquals("ERROR_INTERNO", p.getProperties().get("codigo"));
        assertEquals("Error interno", p.getTitle());
        assertFalse(p.getDetail().contains("columna"), p.getDetail());
    }
}
