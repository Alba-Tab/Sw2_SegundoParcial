# Flota

Unidades (tractos y remolques), choferes, reservas de la saga, combustible y mantenimiento. NestJS 11 sobre Node 24, arquitectura Clean (ver [AGENTS.md](AGENTS.md)), MongoDB. API en el puerto **8102**; el worker no expone puertos.

| Pieza del esqueleto (T3a.3) | Dónde |
|---|---|
| Salud `GET /health` y `GET /health/ready` (Mongo y RabbitMQ), sin Keycloak (P10) | `infraestructura/http/salud.controller.ts` |
| JWT con `jose` (emisor, audiencia `flota`, roles de `realm_access`), llaves perezosas; sin `OIDC_ISSUER`, `/api/**` responde 503 | `infraestructura/http/autenticacion.middleware.ts` |
| Problem Details con `codigo` y `correlationId`; `X-Correlation-Id` | `infraestructura/http/filtro-problemas.ts`, `correlacion.middleware.ts` |
| Transacción de Mongo (réplica `rs0`) con la sesión en `AsyncLocalStorage` | `infraestructura/persistencia/mongo-unidad-de-trabajo.ts` |
| Outbox en `outboxEventos` dentro de la transacción y relay con *publisher confirms* y reclamo de 30 s por fila | `infraestructura/persistencia/registro-de-eventos-mongo.ts`, `infraestructura/mensajeria/relay-outbox.ts` |
| Logs JSON (000 §10) con pino; trazas OTLP solo si `OTEL_EXPORTER_OTLP_ENDPOINT` existe | `infraestructura/observabilidad/` |
| Dos procesos: `main.ts` (API) y `worker.ts` (relay y actividades de Temporal; consumidores en F5) | `src/` |

```bash
npm ci && npm run verificar     # 22 pruebas + tipos + capas + formato
docker compose -f ../../plataforma/compose/compose.yaml --profile core --profile plataforma up -d --build flota-api flota-worker
curl localhost:8102/health/ready
```

## Actividades de la saga (T4.5, spec 003)

- **Worker:** `TrabajadorTemporal` registra en la cola `flota` las actividades de `infraestructura/temporal/actividades-flota.ts`, con los nombres del contrato (S14). Si Temporal no responde, reintenta cada 5 s sin tumbar el proceso. Variables: `TEMPORAL_ADDRESS`, y `TEMPORAL_WORKER=false` para apagarlo.
- **`Flota.reservarUnidad`** (`aplicacion/reserva/reservar-unidad.ts`):
  - Corre en una transacción de Mongo.
  - Toma un remolque compatible con la carga y su capacidad, un tracto y un chofer con licencia C vigente.
  - Las unidades deben estar `DISPONIBLE`, con SOAT e inspección vigentes el día del viaje.
  - Elige la de más km desde su último mantenimiento, con desempate por placa (D11).
  - Cada toma es una actualización condicional (`DISPONIBLE` → `RESERVADA`, `disponible: true` → `false`), así que dos sagas nunca toman la misma unidad.
  - Es idempotente por `servicioId` (índice único en `reservasUnidad`). Si no encuentra unidad, falla con `SIN_UNIDAD_COMPATIBLE`, que no se reintenta.
- **`Flota.confirmarReserva`:** pasa de `PROVISIONAL` a `CONFIRMADA`.
- **`Flota.liberarReserva`:** devuelve las unidades y el chofer. Si el servicio no tenía reserva, deja una lápida `LIBERADA` para que una reserva tardía no tome unidades.
- **Pruebas:** `test/unitarias/reservas.spec.ts` (reglas de elección) y `test/integracion/reservas.spec.ts` (Mongo rs0: elección, concurrencia, falla sin unidad, idempotencia y lápida).

## Cancelación (T4.7, spec 004)

- **Consumidor:** `ConsumidorEventos` escucha `flota.eventos` en el worker. `CONSUMIR_EVENTOS=false` lo apaga.
- **Mensajes sin manejador o que no son JSON:** van a la DLQ (nack sin reencolar). Si el manejador falla por algo técnico, el mensaje se reencola.
- **`ViajeCancelado`** (de un usuario o de la saga): `LiberarPorCancelacion` libera la reserva del servicio en la misma transacción que el Inbox (`inboxEventos`, con el `eventId` como `_id`). Así se liberan solas las reservas de una intervención resuelta a mano (spec 011).
- **Inbox:** primero consulta y después inserta. Una clave duplicada dentro de una transacción de Mongo la aborta, y mongoose la reintentaba sin fin.
