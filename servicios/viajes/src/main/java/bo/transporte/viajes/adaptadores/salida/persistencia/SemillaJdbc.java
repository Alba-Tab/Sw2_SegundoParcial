package bo.transporte.viajes.adaptadores.salida.persistencia;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Carga la parte de Viajes de plataforma/semilla (D102): clientes y rutas, directo en la base y sin Outbox (no dispara
 * ClienteActualizado ni RutaActualizada; Finanzas carga sus copias de los mismos archivos). Idempotente (UPSERT por id).
 */
@Component
public class SemillaJdbc {
    private final JdbcClient jdbc;
    private final JsonMapper json;

    SemillaJdbc(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /** @return cuántos clientes y rutas cargó */
    @Transactional
    public int[] cargar(Path dir) throws java.io.IOException {
        JsonNode clientes = json.readTree(Files.readString(dir.resolve("clientes.json")));
        JsonNode rutas = json.readTree(Files.readString(dir.resolve("rutas.json")));
        Timestamp ahora = Timestamp.from(Instant.now());
        for (JsonNode c : clientes) {
            String sub = c.path("sub").isNull() ? null : c.path("sub").asString();
            jdbc.sql("""
                            INSERT INTO cliente (cliente_id, sub, razon_social, nit, correo, telefono, direccion, canal,
                                                 vinculado, creado_por, creado_en, version_agregado, activo)
                            VALUES (CAST(:id AS uuid), :sub, :razon, :nit, :correo, :telefono, :direccion, :canal,
                                    :vinculado, :creadoPor, :ahora, 1, true)
                            ON CONFLICT (cliente_id) DO UPDATE SET sub = EXCLUDED.sub, razon_social = EXCLUDED.razon_social,
                                nit = EXCLUDED.nit, correo = EXCLUDED.correo, telefono = EXCLUDED.telefono,
                                direccion = EXCLUDED.direccion, canal = EXCLUDED.canal, vinculado = EXCLUDED.vinculado,
                                activo = true""")
                    .param("id", c.get("clienteId").asString())
                    .param("sub", sub)
                    .param("razon", c.get("razonSocial").asString())
                    .param("nit", c.get("nit").asString())
                    .param("correo", c.get("correo").asString())
                    .param("telefono", c.get("telefono").asString())
                    .param("direccion", c.get("direccion").asString())
                    .param("canal", c.get("canal").asString())
                    .param("vinculado", sub != null)
                    .param("creadoPor", sub != null ? sub : c.path("creadoPor").asString())
                    .param("ahora", ahora)
                    .update();
        }
        for (JsonNode r : rutas) {
            JsonNode o = r.get("origen"), d = r.get("destino");
            jdbc.sql("""
                            INSERT INTO ruta (ruta_id, nombre, origen_nombre, origen_lat, origen_lng, destino_nombre, destino_lat,
                                              destino_lng, radio_metros, distancia_km, activa, version_agregado)
                            VALUES (CAST(:id AS uuid), :nombre, :oNombre, :oLat, :oLng, :dNombre, :dLat, :dLng, :radio, :km, true, 1)
                            ON CONFLICT (ruta_id) DO UPDATE SET nombre = EXCLUDED.nombre, origen_nombre = EXCLUDED.origen_nombre,
                                origen_lat = EXCLUDED.origen_lat, origen_lng = EXCLUDED.origen_lng,
                                destino_nombre = EXCLUDED.destino_nombre, destino_lat = EXCLUDED.destino_lat,
                                destino_lng = EXCLUDED.destino_lng, radio_metros = EXCLUDED.radio_metros,
                                distancia_km = EXCLUDED.distancia_km, activa = true""")
                    .param("id", r.get("rutaId").asString())
                    .param("nombre", r.get("nombre").asString())
                    .param("oNombre", o.get("nombre").asString())
                    .param("oLat", o.get("coordenadas").get("lat").asDouble())
                    .param("oLng", o.get("coordenadas").get("lng").asDouble())
                    .param("dNombre", d.get("nombre").asString())
                    .param("dLat", d.get("coordenadas").get("lat").asDouble())
                    .param("dLng", d.get("coordenadas").get("lng").asDouble())
                    .param("radio", d.get("radioMetros").asInt())
                    .param("km", r.get("distanciaKm").decimalValue())
                    .update();
        }
        return new int[] {clientes.size(), rutas.size()};
    }
}
