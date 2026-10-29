package bo.transporte.viajes.adaptadores.temporal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.*;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/**
 * S15: cada ejemplo de contratos/temporal/programar-viaje.schema.json se deserializa en su record con el conversor de
 * Temporal (estricto: falla ante campos desconocidos) y vuelve a serializarse igual. Los números se comparan por valor
 * porque {@code toneladas} es BigDecimal y el ejemplo trae un entero.
 */
class ContratoSagaTest {
    private static final Comparator<JsonNode> NUMEROS_POR_VALOR =
            (a, b) -> a.isNumber() && b.isNumber() ? a.decimalValue().compareTo(b.decimalValue()) : a.equals(b) ? 0 : 1;

    private static final Map<String, Class<?>> TIPOS = Map.ofEntries(
            Map.entry("ParametrosSaga", ParametrosSaga.class),
            Map.entry("EntradaProgramarViaje", EntradaProgramarViaje.class),
            Map.entry("ResultadoProgramarViaje", ResultadoProgramarViaje.class),
            Map.entry("EstadoProgramarViaje", EstadoProgramarViaje.class),
            Map.entry("SenalAprobacionCredito", SenalAprobacionCredito.class),
            Map.entry("SenalResolverIntervencion", SenalResolverIntervencion.class),
            Map.entry("CrearViajeEntrada", CrearViajeEntrada.class),
            Map.entry("ValidarYReservarCreditoEntrada", ValidarYReservarCreditoEntrada.class),
            Map.entry("ValidarYReservarCreditoResultado", ValidarYReservarCreditoResultado.class),
            Map.entry("RegistrarDecisionCreditoEntrada", RegistrarDecisionCreditoEntrada.class),
            Map.entry("ReservarUnidadEntrada", ReservarUnidadEntrada.class),
            Map.entry("ReservarUnidadResultado", ReservarUnidadResultado.class),
            Map.entry("ConfirmarViajeEntrada", ConfirmarViajeEntrada.class),
            Map.entry("ConfirmarReservaEntrada", ConfirmarReservaEntrada.class),
            Map.entry("MarcarConfirmacionCompletaEntrada", MarcarConfirmacionCompletaEntrada.class),
            Map.entry("LiberarReservaEntrada", LiberarReservaEntrada.class),
            Map.entry("LiberarCreditoEntrada", LiberarCreditoEntrada.class),
            Map.entry("CancelarViajeEntrada", CancelarViajeEntrada.class),
            Map.entry("MarcarRequiereIntervencionEntrada", MarcarRequiereIntervencionEntrada.class),
            Map.entry("DetalleFallo", DetalleFallo.class));

    @Test
    void losEjemplosDelContratoIdaYVuelta() {
        var m = ConversorTemporal.MAPPER;
        JsonNode defs = m.readTree(Path.of("../../contratos/temporal/programar-viaje.schema.json")
                        .toFile())
                .get("$defs");
        assertEquals(TIPOS.keySet().size(), defs.size(), "Cada $defs del contrato tiene su record");
        int n = 0;
        for (var e : TIPOS.entrySet()) {
            for (JsonNode ejemplo : defs.get(e.getKey()).get("examples")) {
                Object valor = m.treeToValue(ejemplo, e.getValue());
                JsonNode vuelta = m.readTree(m.writeValueAsString(valor));
                assertTrue(ejemplo.equals(NUMEROS_POR_VALOR, vuelta), e.getKey() + ": " + ejemplo + " ≠ " + vuelta);
                n++;
            }
        }
        assertTrue(n >= TIPOS.size());
    }
}
