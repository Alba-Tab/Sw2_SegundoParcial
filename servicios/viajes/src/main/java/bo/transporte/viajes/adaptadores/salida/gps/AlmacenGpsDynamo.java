package bo.transporte.viajes.adaptadores.salida.gps;

import bo.transporte.viajes.aplicacion.puerto.salida.AlmacenGps;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.viaje.PuntoGps;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.ProvisionedThroughputExceededException;
import software.amazon.awssdk.services.dynamodb.model.PutRequest;
import software.amazon.awssdk.services.dynamodb.model.WriteRequest;

/**
 * DynamoDB (propuesta 4.4, spec 005). {@code BatchWriteItem} de 25 elementos; los {@code UnprocessedItems} se reintentan
 * hasta 5 veces con espera exponencial y aleatoria desde 100 ms (100, 200, 400, 800 y 1.600 ms); si siguen pendientes,
 * {@link SinCapacidad} y la API responde 503 con Retry-After. En local, DynamoDB Local por {@code gps.endpoint}.
 */
@Component
class AlmacenGpsDynamo implements AlmacenGps {
    static final String PUNTOS = "gps_puntos";
    static final String CURSOR = "sync_cursor";
    private static final int POR_LLAMADA = 25;
    private static final int REINTENTOS = 5;
    private static final long ESPERA_BASE_MS = 100;
    private static final Pattern TS_SEQ = Pattern.compile("\\d{4}-\\d{2}-\\d{2}T[0-9:]{8}Z#\\d{6,}");

    private final DynamoDbClient dynamo;

    /** Mismas credenciales que el almacén de evidencias; sin claves, la cadena por defecto de AWS. */
    @Autowired
    AlmacenGpsDynamo(
            @Value("${gps.endpoint:}") String endpoint,
            @Value("${almacen.region}") String region,
            @Value("${almacen.clave-acceso:}") String claveAcceso,
            @Value("${almacen.clave-secreta:}") String claveSecreta) {
        this(cliente(endpoint, region, claveAcceso, claveSecreta));
    }

    AlmacenGpsDynamo(DynamoDbClient dynamo) {
        this.dynamo = dynamo;
    }

    private static DynamoDbClient cliente(String endpoint, String region, String claveAcceso, String claveSecreta) {
        var b = DynamoDbClient.builder().region(Region.of(region));
        if (!claveAcceso.isBlank()) {
            b.credentialsProvider(
                    StaticCredentialsProvider.create(AwsBasicCredentials.create(claveAcceso, claveSecreta)));
        }
        if (!endpoint.isBlank()) b.endpointOverride(URI.create(endpoint));
        return b.build();
    }

    @Override
    public void escribir(UUID viajeId, UUID dispositivoId, List<PuntoGps> puntos) {
        for (int i = 0; i < puntos.size(); i += POR_LLAMADA) {
            List<WriteRequest> grupo = puntos.subList(i, Math.min(i + POR_LLAMADA, puntos.size())).stream()
                    .map(p -> WriteRequest.builder()
                            .putRequest(PutRequest.builder()
                                    .item(elemento(viajeId, dispositivoId, p))
                                    .build())
                            .build())
                    .toList();
            escribirGrupo(Map.of(PUNTOS, grupo));
        }
    }

    private void escribirGrupo(Map<String, List<WriteRequest>> pendientes) {
        for (int intento = 0; ; intento++) {
            var enviar = pendientes;
            try {
                pendientes = dynamo.batchWriteItem(b -> b.requestItems(enviar)).unprocessedItems();
            } catch (ProvisionedThroughputExceededException e) {
                // Toda la llamada se rechazó por capacidad: se reintenta igual que los pendientes.
            }
            if (pendientes.isEmpty() || pendientes.values().stream().allMatch(List::isEmpty)) return;
            if (intento == REINTENTOS) throw new SinCapacidad("DynamoDB sigue sin capacidad para " + PUNTOS);
            esperar(intento);
        }
    }

    /** Espera exponencial con variación aleatoria: entre la mitad y el total de 100 ms × 2^intento. */
    private static void esperar(int intento) {
        long tope = ESPERA_BASE_MS << intento;
        try {
            Thread.sleep(tope / 2 + ThreadLocalRandom.current().nextLong(tope / 2 + 1));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SinCapacidad("Interrumpido esperando a DynamoDB");
        }
    }

    /** Llave de orden {@code ts#seq}, p. ej. {@code 2026-11-03T12:10:30Z#001042}. */
    static String tsSeq(PuntoGps p) {
        return "%s#%06d".formatted(p.registradaEn().truncatedTo(ChronoUnit.SECONDS), p.seq());
    }

    private static Map<String, AttributeValue> elemento(UUID viajeId, UUID dispositivoId, PuntoGps p) {
        Map<String, AttributeValue> item = new HashMap<>();
        item.put("viajeId", s(viajeId.toString()));
        item.put("tsSeq", s(tsSeq(p)));
        item.put("dispositivoId", s(dispositivoId.toString()));
        item.put("seq", n(p.seq()));
        item.put("registradaEn", s(p.registradaEn().toString()));
        item.put("lat", n(p.lat()));
        item.put("lng", n(p.lng()));
        item.put("velocidadKmh", n(p.velocidadKmh()));
        if (p.precisionMetros() != null) item.put("precisionMetros", n(p.precisionMetros()));
        item.put("expiraEn", n(p.registradaEn().plus(PuntoGps.RETENCION).getEpochSecond()));
        return item;
    }

    @Override
    public Pagina recorrido(UUID viajeId, String cursor, int limite) {
        var r = dynamo.query(q -> {
            q.tableName(PUNTOS)
                    .keyConditionExpression("viajeId = :v")
                    .expressionAttributeValues(Map.of(":v", s(viajeId.toString())))
                    .limit(limite);
            if (cursor != null && !cursor.isBlank()) {
                q.exclusiveStartKey(Map.of("viajeId", s(viajeId.toString()), "tsSeq", s(desdeCursor(cursor))));
            }
        });
        List<PuntoGuardado> items = new ArrayList<>();
        for (var i : r.items()) {
            items.add(new PuntoGuardado(
                    UUID.fromString(i.get("dispositivoId").s()),
                    new PuntoGps(
                            Long.parseLong(i.get("seq").n()),
                            Instant.parse(i.get("registradaEn").s()),
                            Double.parseDouble(i.get("lat").n()),
                            Double.parseDouble(i.get("lng").n()),
                            Double.parseDouble(i.get("velocidadKmh").n()),
                            i.containsKey("precisionMetros")
                                    ? Double.valueOf(i.get("precisionMetros").n())
                                    : null)));
        }
        String siguiente = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty()
                ? aCursor(r.lastEvaluatedKey().get("tsSeq").s())
                : null;
        return new Pagina(items, siguiente);
    }

    @Override
    public void avanzarCursor(UUID dispositivoId, UUID viajeId, long seq) {
        try {
            dynamo.putItem(b -> b.tableName(CURSOR)
                    .item(Map.of(
                            "dispositivoId", s(dispositivoId.toString()),
                            "viajeId", s(viajeId.toString()),
                            "ultimaSecuencia", n(seq),
                            "actualizadoEn", s(Instant.now().toString())))
                    .conditionExpression("attribute_not_exists(dispositivoId) OR ultimaSecuencia < :seq")
                    .expressionAttributeValues(Map.of(":seq", n(seq))));
        } catch (ConditionalCheckFailedException e) {
            // Ya tenía un seq mayor o igual (lote atrasado o reenviado): no se retrocede.
        }
    }

    @Override
    public OptionalLong cursor(UUID dispositivoId, UUID viajeId) {
        var r = dynamo.getItem(b -> b.tableName(CURSOR)
                .key(Map.of("dispositivoId", s(dispositivoId.toString()), "viajeId", s(viajeId.toString())))
                .consistentRead(true));
        return r.hasItem() && !r.item().isEmpty()
                ? OptionalLong.of(Long.parseLong(r.item().get("ultimaSecuencia").n()))
                : OptionalLong.empty();
    }

    private static String aCursor(String tsSeq) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(tsSeq.getBytes(StandardCharsets.UTF_8));
    }

    /** El cursor es opaco para el cliente; uno alterado es un 400 VALIDACION, no un 500 (spec 005). */
    static String desdeCursor(String cursor) {
        try {
            String tsSeq = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            if (TS_SEQ.matcher(tsSeq).matches()) return tsSeq;
        } catch (IllegalArgumentException e) {
            // Base64 inválido: cae al error de abajo.
        }
        throw new ErrorDeDominio("VALIDACION", "cursor: valor inválido", Map.of("campo", "cursor"));
    }

    private static AttributeValue s(String v) {
        return AttributeValue.fromS(v);
    }

    private static AttributeValue n(Number v) {
        return AttributeValue.fromN(v.toString());
    }
}
