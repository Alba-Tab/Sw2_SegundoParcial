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
| Dos procesos: `main.ts` (API) y `worker.ts` (relay; Temporal y consumidores en F4) | `src/` |

```bash
npm ci && npm run verificar     # 9 pruebas + tipos + capas
docker compose -f ../../plataforma/compose/compose.yaml --profile core --profile plataforma up -d --build flota-api flota-worker
curl localhost:8102/health/ready
```
