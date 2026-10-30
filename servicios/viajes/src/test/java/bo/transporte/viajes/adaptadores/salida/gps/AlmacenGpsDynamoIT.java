package bo.transporte.viajes.adaptadores.salida.gps;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import bo.transporte.viajes.DynamoDePrueba;
import bo.transporte.viajes.aplicacion.puerto.salida.AlmacenGps;
import bo.transporte.viajes.dominio.viaje.PuntoGps;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.LongStream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.BatchWriteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.BatchWriteItemResponse;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemResponse;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemResponse;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.WriteRequest;

/** El adaptador contra DynamoDB Local, con *throttling* simulado (FO4): {@code UnprocessedItems} como en AWS. */
class AlmacenGpsDynamoIT {
    static GenericContainer<?> dynamo;
    static DynamoDbClient real;

    @BeforeAll
    static void iniciar() {
        dynamo = DynamoDePrueba.iniciar();
        real = DynamoDePrueba.cliente(DynamoDePrueba.endpoint(dynamo));
    }

    @AfterAll
    static void detener() {
        real.close();
        dynamo.stop();
    }

    /** Devuelve sin escribir la mitad de cada llamada (o todo) mientras {@code limitadas} sea mayor que cero. */
    static class ConThrottling implements DynamoDbClient {
        final AtomicInteger limitadas;
        final boolean todo;
        final AtomicInteger llamadas = new AtomicInteger();

        ConThrottling(int limitadas, boolean todo) {
            this.limitadas = new AtomicInteger(limitadas);
            this.todo = todo;
        }

        @Override
        public BatchWriteItemResponse batchWriteItem(BatchWriteItemRequest r) {
            llamadas.incrementAndGet();
            if (limitadas.getAndDecrement() <= 0) return real.batchWriteItem(r);
            Map<String, List<WriteRequest>> pendientes = new HashMap<>();
            Map<String, List<WriteRequest>> escribir = new HashMap<>();
            r.requestItems().forEach((tabla, items) -> {
                int corte = todo ? 0 : items.size() / 2;
                escribir.put(tabla, items.subList(0, corte));
                pendientes.put(tabla, items.subList(corte, items.size()));
            });
            if (escribir.values().stream().anyMatch(l -> !l.isEmpty())) {
                real.batchWriteItem(b -> b.requestItems(escribir));
            }
            return BatchWriteItemResponse.builder().unprocessedItems(pendientes).build();
        }

        @Override
        public QueryResponse query(QueryRequest r) {
            return real.query(r);
        }

        @Override
        public PutItemResponse putItem(PutItemRequest r) {
            return real.putItem(r);
        }

        @Override
        public GetItemResponse getItem(GetItemRequest r) {
            return real.getItem(r);
        }

        @Override
        public String serviceName() {
            return SERVICE_NAME;
        }

        @Override
        public void close() {}
    }

    private static List<PuntoGps> puntos(int n) {
        Instant t0 = Instant.parse("2026-11-03T12:00:00Z");
        return LongStream.range(0, n)
                .mapToObj(i -> new PuntoGps(i, t0.plusSeconds(20 * i), -17.78 - i / 10000.0, -63.18, 60, 8.0))
                .toList();
    }

    private static int todos(AlmacenGps a, UUID viajeId) {
        int n = 0;
        String cursor = null;
        do {
            var p = a.recorrido(viajeId, cursor, 100);
            n += p.items().size();
            cursor = p.siguienteCursor();
        } while (cursor != null);
        return n;
    }

    @Test
    void escribe480PuntosReintentandoLosPendientesSinDuplicar() {
        // La llamada y 4 reintentos limitados: el quinto reintento ya escribe todo.
        var limitado = new ConThrottling(5, false);
        var almacen = new AlmacenGpsDynamo(limitado);
        UUID viaje = UUID.randomUUID();
        var lote = puntos(480);
        for (int i = 0; i < lote.size(); i += 100) {
            almacen.escribir(viaje, UUID.randomUUID(), lote.subList(i, Math.min(i + 100, lote.size())));
        }
        assertEquals(480, todos(almacen, viaje));
        // Un reenvío reescribe los mismos elementos: la llave viajeId + ts#seq es la autoridad (000 §4.1).
        almacen.escribir(viaje, UUID.randomUUID(), lote.subList(0, 100));
        assertEquals(480, todos(almacen, viaje));
    }

    @Test
    void conThrottlingSostenidoAvisaSinCapacidadYAlVolverGuardaTodo() {
        var limitado = new ConThrottling(1000, true);
        var almacen = new AlmacenGpsDynamo(limitado);
        UUID viaje = UUID.randomUUID();
        var lote = puntos(100);
        assertThrows(AlmacenGps.SinCapacidad.class, () -> almacen.escribir(viaje, UUID.randomUUID(), lote));
        assertEquals(6, limitado.llamadas.get(), "la llamada y 5 reintentos");
        limitado.limitadas.set(0);
        almacen.escribir(viaje, UUID.randomUUID(), lote);
        assertEquals(100, todos(almacen, viaje));
    }

    @Test
    void elRecorridoSaleEnOrdenYPorPaginas() {
        var almacen = new AlmacenGpsDynamo(real);
        UUID viaje = UUID.randomUUID();
        UUID celular = UUID.randomUUID();
        almacen.escribir(viaje, celular, puntos(250));
        List<Long> seqs = new ArrayList<>();
        String cursor = null;
        int paginas = 0;
        do {
            var p = almacen.recorrido(viaje, cursor, 100);
            p.items().forEach(g -> seqs.add(g.punto().seq()));
            cursor = p.siguienteCursor();
            paginas++;
        } while (cursor != null);
        assertEquals(LongStream.range(0, 250).boxed().toList(), seqs);
        assertEquals(3, paginas);
        assertEquals(
                celular, almacen.recorrido(viaje, null, 1).items().getFirst().dispositivoId());
    }

    @Test
    void elCursorSoloAvanza() {
        var almacen = new AlmacenGpsDynamo(real);
        UUID celular = UUID.randomUUID();
        UUID viaje = UUID.randomUUID();
        assertEquals(OptionalLong.empty(), almacen.cursor(celular, viaje));
        almacen.avanzarCursor(celular, viaje, 42);
        almacen.avanzarCursor(celular, viaje, 17);
        assertEquals(OptionalLong.of(42), almacen.cursor(celular, viaje));
        assertNull(almacen.recorrido(UUID.randomUUID(), null, 10).siguienteCursor());
    }
}
