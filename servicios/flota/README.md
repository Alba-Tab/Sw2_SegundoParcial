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
npm ci && npm run verificar     # 65 pruebas (35 unitarias, 30 de integración) + tipos + capas + formato
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
- **Mensajes sin manejador o que no son JSON:** van a la DLQ (nack sin reencolar). Si el manejador falla por algo técnico, el mensaje se reencola después de una espera de 1, 2, 4, 8 y 15 s según `x-delivery-count`, así una caída corta de Mongo no agota las 5 entregas.
- **Conexión:** la conexión y los canales AMQP tienen listeners de `error` y `close`; si se cae uno, el consumidor cierra todo y reconecta cada 5 s. Los eventos que publica llevan el `correlationId` y el `traceparent` del evento consumido.
- **`ViajeCancelado`** (de un usuario o de la saga): `LiberarPorCancelacion` libera la reserva del servicio en la misma transacción que el Inbox (`inboxEventos`, con el `eventId` como `_id`). Así se liberan solas las reservas de una intervención resuelta a mano (spec 011).
- **Inbox:** primero consulta y después inserta. Una clave duplicada dentro de una transacción de Mongo la aborta, y mongoose la reintentaba sin fin.

## Unidades en viaje, liberación y mantenimiento (T5.3, specs 005, 006, 007 y 010)

- **`ViajeIniciado`** (D20): tracto y remolque `RESERVADA` → `EN_VIAJE`, solo si la reserva sigue activa; uno tardío sobre una reserva `LIBERADA` se ignora.
- **`EntregaConfirmada` y `EntregaRechazada`**: reserva `LIBERADA`; tracto, remolque y chofer salen de la reserva (no del evento) y, si la reserva no existe o ya está `LIBERADA`, no se toca nada; tracto y remolque suman `kmRecorridos` a `kmDesdeUltimoMantenimiento` (D07; el odómetro no cambia) y pasan a `DISPONIBLE` o `MANTENIMIENTO_PENDIENTE` según la regla C (≥ 10.000 km, SOAT o inspección que vencen en 15 días o menos), con `MantenimientoRequerido` en el Outbox; el chofer queda disponible. También desde `RESERVADA` si la entrega llegó antes que `ViajeIniciado`.
- **Outbox**: valida cada evento contra `contratos/eventos` (ajv 2020, copiados en la imagen; `CONTRATOS_DIR`) y siempre completa `correlationId` y `traceparent` (los de la petición o del evento consumido; si no hay, nuevos). Índice parcial de pendientes para el relay y TTL de 7 días sobre los publicados.
- **`GET /api/v1/unidades`**, `/{unidadId}`, **`/choferes`** y `/{choferId}` (jefe de flota, despachador, gerente; el chofer se ve a sí mismo).
- **CLI**: `node dist/cli.js choferes:actualizar <choferId> --licenciaVenceEl=… --activo=…` guarda el cambio, sube `versionAgregado` y deja `ChoferActualizado` (spec 010, sección D).

## Combustible (T5.3b, spec 009)

- **`POST /api/v1/cargas-combustible`** (chofer): `Idempotency-Key` igual al `opId`; el mismo `opId` con el mismo cuerpo devuelve la carga guardada (solo al chofer que la registró) y con otro cuerpo es `422 IDEMPOTENCIA_CUERPO_DISTINTO`. El tracto sale de la reserva del `viajeId`, que debe estar `CONFIRMADA` o `LIBERADA`, y el chofer debe ser el asignado. En Mongo, `monto` es `Decimal128` (000 §3) y `registradaEn` un `Date` (000 §2). Rechaza litros sobre `capacidadTanqueLitros` (`CARGA_EXCEDE_TANQUE`), kilometraje menor al odómetro (`KILOMETRAJE_INVALIDO`), monto no positivo y hora futura. Sube el odómetro del tracto y deja `CargaCombustibleRegistrada` en el Outbox.
- **`GET /api/v1/cargas-combustible`** y **`GET /api/v1/unidades/{unidadId}/lecturas-combustible?desde=…`** (como máximo 24 h).
- **Sensor** (cola `flota.sensor`, la llena el puente MQTT): cada lectura se guarda una vez por `placa + medidoEn` (TTL 30 días). Detenido, una caída de 8 puntos o más en 10 minutos (D08) deja una detección por parada y `CaidaCombustibleDetectada`, con el `viajeId` si el tracto está `EN_VIAJE`. La parada empieza en la primera lectura después de la última en marcha, sin importar cuánto dure: no hay otra detección hasta que el tracto se mueva. La cola se consume en serie (canal propio con prefetch 1). Un mensaje que no cumple el contrato va a `flota.sensor.dlq`.

## Unidades y mantenimiento (T5.3c, spec 010, secciones A y E)

- **`POST /api/v1/unidades`**, **`PUT /api/v1/unidades/{unidadId}`** y **`POST /api/v1/unidades/{unidadId}/baja`** (solo `jefe_flota`). Atributos por tipo según D76 (`dominio/unidad/atributos.ts`); un campo de otro tipo es `400` con `errores[].campo`. Placa única (`409 PLACA_DUPLICADA`). La alta nace `MANTENIMIENTO_PENDIENTE` (con `MantenimientoRequerido`) si ya cumple la regla C. El `PUT` no acepta `estado`, `placa`, `kilometraje` ni `kmDesdeUltimoMantenimiento`, y devuelve a `DISPONIBLE` una unidad pendiente cuyos documentos se renovaron. `GET /unidades` acepta `placa`.
- **`POST /api/v1/unidades/{unidadId}/mantenimientos`**, **`POST /api/v1/mantenimientos/{id}/cierre`** y **`GET /api/v1/mantenimientos`**. Colección `mantenimientos` con un solo `EN_CURSO` por unidad (índice parcial único). El cierre exige el checklist completo con `ok = true`, el odómetro en tractos, pone en 0 los km si es `PREVENTIVO` o `CORRECTIVO` y vuelve a evaluar la regla C.
- **Idempotencia** (000 §4.1): colección `operacionIdempotente` con la clave (UUID) en `_id`, operación, hash y respuesta, en la misma transacción que el cambio (`aplicacion/comun/idempotencia.ts`). El hash cubre método, ruta con sus ids, `sub` del token y cuerpo (`infraestructura/http/hash-cuerpo.ts`): la misma clave en otro recurso o de otro usuario es `422 IDEMPOTENCIA_CUERPO_DISTINTO`.
- **Revisión diaria (D75)**: el worker revisa a las 06:00 `America/La_Paz` los documentos de las unidades `DISPONIBLE`. A mano: `node dist/cli.js unidades:revisar-documentos`.
- Errores: en un `400`, `campo` va en `errores`; los demás `datos` (como `estadoActual`) van como extensiones del Problem Details. Un error de body-parser conserva su estado (`413`, `415` o `400`, código `VALIDACION`). Mongo o Keycloak caídos responden `503 DEPENDENCIA_NO_DISPONIBLE` con `Retry-After` (también `/health/ready`).
- Logs del SDK de Temporal en el mismo JSON (`Runtime.install` con pino).
