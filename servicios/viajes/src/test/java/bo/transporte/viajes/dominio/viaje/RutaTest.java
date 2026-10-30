package bo.transporte.viajes.dominio.viaje;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Reglas del viaje en ruta (spec 005): lotes de GPS, frenadas (D08) y bitácora. */
class RutaTest {
    static final Instant INICIO = Instant.parse("2026-11-03T12:00:00Z");
    static final Instant AHORA = INICIO.plusSeconds(600);

    static PuntoGps p(long seq, Instant en) {
        return new PuntoGps(seq, en, -17.78, -63.18, 50, 5.0);
    }

    @Test
    void elLoteDebeTenerDe1A100PuntosSinRepetirSeq() {
        assertThrows(ErrorDeDominio.class, () -> PuntoGps.validarLote(List.of(), INICIO, AHORA));
        var ciento1 = java.util.stream.LongStream.range(0, 101)
                .mapToObj(i -> p(i, INICIO))
                .toList();
        assertThrows(ErrorDeDominio.class, () -> PuntoGps.validarLote(ciento1, INICIO, AHORA));
        var repetido = assertThrows(
                ErrorDeDominio.class, () -> PuntoGps.validarLote(List.of(p(1, INICIO), p(1, INICIO)), INICIO, AHORA));
        assertEquals("VALIDACION", repetido.codigo());
    }

    @Test
    void lasHorasDebenCaerEntreElInicioMenos10MinYAhoraMas2Min() {
        assertDoesNotThrow(() -> PuntoGps.validarLote(
                List.of(p(0, INICIO.minusSeconds(599)), p(1, AHORA.plusSeconds(119))), INICIO, AHORA));
        assertThrows(
                ErrorDeDominio.class,
                () -> PuntoGps.validarLote(List.of(p(0, INICIO.minusSeconds(601))), INICIO, AHORA));
        assertThrows(
                ErrorDeDominio.class, () -> PuntoGps.validarLote(List.of(p(0, AHORA.plusSeconds(121))), INICIO, AHORA));
    }

    @Test
    void elMasNuevoEsPorHoraYLuegoPorSeq() {
        var a = p(5, INICIO.plusSeconds(40));
        var b = p(6, INICIO.plusSeconds(40));
        assertEquals(b, PuntoGps.masNuevo(List.of(a, b, p(9, INICIO))));
    }

    @Test
    void unaFrenadaBruscaEsDe04GOMas() {
        var id = UUID.randomUUID();
        assertThrows(
                ErrorDeDominio.class,
                () -> new EventoConduccion(
                        id, id, EventoConduccion.Tipo.FRENADA_BRUSCA, new BigDecimal("0.39"), 0, 0, AHORA));
        assertThrows(
                ErrorDeDominio.class,
                () -> new EventoConduccion(id, id, EventoConduccion.Tipo.FRENADA_BRUSCA, null, 0, 0, AHORA));
        assertDoesNotThrow(() ->
                new EventoConduccion(id, id, EventoConduccion.Tipo.FRENADA_BRUSCA, new BigDecimal("0.4"), 0, 0, AHORA));
        assertDoesNotThrow(() -> new EventoConduccion(id, id, EventoConduccion.Tipo.ALERTA_FATIGA, null, 0, 0, AHORA));
    }

    @Test
    void laDescripcionDelHitoVaDe3A500Caracteres() {
        var id = UUID.randomUUID();
        assertThrows(
                ErrorDeDominio.class, () -> new Hito(id, id, Hito.Tipo.BLOQUEO, "  ab ", 0, 0, AHORA, Hito.Origen.VOZ));
        assertEquals(
                "Bloqueo en el puente",
                new Hito(id, id, Hito.Tipo.BLOQUEO, " Bloqueo en el puente ", 0, 0, AHORA, Hito.Origen.VOZ)
                        .descripcion());
    }

    @Test
    void soloEnRutaODespuesDeLaEntregaSeAceptanRegistros() {
        assertEquals(
                List.of(
                        EstadoViaje.EN_RUTA,
                        EstadoViaje.ENTREGADO,
                        EstadoViaje.ENTREGA_OBSERVADA,
                        EstadoViaje.ENTREGA_RECHAZADA,
                        EstadoViaje.CERRADO),
                java.util.Arrays.stream(EstadoViaje.values())
                        .filter(EstadoViaje::aceptaRegistrosDeRuta)
                        .toList());
    }
}
