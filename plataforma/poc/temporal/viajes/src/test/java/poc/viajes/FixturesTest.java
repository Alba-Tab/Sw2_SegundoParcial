package poc.viajes;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import poc.viajes.Contrato.*;
import tools.jackson.databind.JsonNode;

/** S15: cada ejemplo del contrato se deserializa en su record (estricto) y vuelve a serializarse igual. */
class FixturesTest {
  private static final Map<String, Class<?>> TIPOS = Map.ofEntries(
      Map.entry("EntradaProgramarViaje", EntradaProgramarViaje.class),
      Map.entry("ResultadoProgramarViaje", ResultadoProgramarViaje.class),
      Map.entry("EstadoProgramarViaje", EstadoProgramarViaje.class),
      Map.entry("CrearViajeEntrada", CrearViajeEntrada.class),
      Map.entry("ValidarYReservarCreditoEntrada", ValidarYReservarCreditoEntrada.class),
      Map.entry("ValidarYReservarCreditoResultado", ValidarYReservarCreditoResultado.class),
      Map.entry("ReservarUnidadEntrada", ReservarUnidadEntrada.class),
      Map.entry("ReservarUnidadResultado", ReservarUnidadResultado.class),
      Map.entry("ConfirmarViajeEntrada", ConfirmarViajeEntrada.class),
      Map.entry("ConfirmarReservaEntrada", ConfirmarReservaEntrada.class),
      Map.entry("MarcarConfirmacionCompletaEntrada", MarcarConfirmacionCompletaEntrada.class),
      Map.entry("LiberarReservaEntrada", LiberarReservaEntrada.class),
      Map.entry("LiberarCreditoEntrada", LiberarCreditoEntrada.class),
      Map.entry("CancelarViajeEntrada", CancelarViajeEntrada.class),
      Map.entry("DetalleFallo", DetalleFallo.class));

  @Test
  void ejemplosDelContrato() {
    var m = Jackson3Conversor.MAPPER;
    JsonNode defs = m.readTree(Path.of(System.getProperty("contrato")).toFile()).get("$defs");
    int n = 0;
    for (var e : TIPOS.entrySet()) {
      for (JsonNode ejemplo : defs.get(e.getKey()).get("examples")) {
        Object valor = m.treeToValue(ejemplo, e.getValue());
        assertEquals(ejemplo, m.readTree(m.writeValueAsString(valor)), e.getKey());
        n++;
      }
    }
    System.out.println("FIXTURES OK: " + n + " ejemplos en " + TIPOS.size() + " tipos");
  }
}
