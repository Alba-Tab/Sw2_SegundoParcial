package bo.transporte.viajes.adaptadores.salida.persistencia;

import com.networknt.schema.Schema;
import com.networknt.schema.SchemaLocation;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * El productor valida cada sobre contra contratos/eventos/viajes/<Tipo>.v<n>.schema.json antes de escribirlo en el
 * Outbox (000 §6). Los esquemas los copia Maven al classpath desde contratos/ (pom.xml); sus $id se resuelven ahí.
 */
@Component
class EsquemasDeEventos {
    private static final String BASE = "https://transporte.local/contratos/";
    private final SchemaRegistry registro = SchemaRegistry.withDefaultDialect(
            SpecificationVersion.DRAFT_2020_12,
            b -> b.schemaIdResolvers(r -> r.mapPrefix(BASE, "classpath:contratos/")));
    private final Map<String, Schema> esquemas = new ConcurrentHashMap<>();

    void validar(String tipo, int version, JsonNode sobre) {
        Schema esquema = esquemas.computeIfAbsent(
                tipo + ".v" + version,
                k -> registro.getSchema(SchemaLocation.of(BASE + "eventos/viajes/" + k + ".schema.json")));
        var errores = esquema.validate(sobre);
        if (!errores.isEmpty()) {
            throw new IllegalStateException("El evento " + tipo + " no cumple su contrato: " + errores);
        }
    }
}
