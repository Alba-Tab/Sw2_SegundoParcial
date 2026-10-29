# Finanzas

Cotizaciones, líneas de crédito, reservas de la saga, facturas y pagos. Laravel 13 sobre PHP 8.4, DDD táctico (ver [AGENTS.md](AGENTS.md)), PostgreSQL. API en el puerto **8103**.

| Pieza del esqueleto (T3a.4) | Dónde |
|---|---|
| `Monto` con brick/money (HALF_UP, BOB, sin negativos) y UUIDv7 | `app/Dominio/Comun/` |
| Puerto `RegistroDeEventos` y su Outbox en `outbox_eventos` (falla fuera de una transacción) | `app/Aplicacion/Puertos/`, `app/Infraestructura/Persistencia/` |
| Relay con *publisher confirms* y `FOR UPDATE SKIP LOCKED` (`outbox:publicar`); consumidor de `finanzas.eventos` con Inbox, que manda a la DLQ lo que no tiene manejador (`eventos:consumir`) | `app/Infraestructura/Mensajeria/`, `app/Infraestructura/Consola/` |
| Salud `GET /health` y `GET /health/ready` (PostgreSQL y RabbitMQ), sin Keycloak (P10) | `app/Infraestructura/Http/SaludController.php` |
| JWT con firebase/php-jwt (emisor, audiencia `finanzas`, llaves en memoria 10 min); sin `OIDC_ISSUER`, `/api/**` responde 503 | `app/Infraestructura/Http/Middleware/Autenticacion.php` |
| Problem Details con `codigo` y `correlationId` para todo error; `X-Correlation-Id` en `Context` | `app/Infraestructura/Http/Problemas.php`, `Middleware/Correlacion.php` |
| Logs JSON de 000 §10; trazas con la extensión `opentelemetry` solo si `OTEL_PHP_AUTOLOAD_ENABLED=true` | `app/Infraestructura/Log/FormatoJson.php`, Dockerfile |
| Tablas comunes (igual que Viajes) | `database/migrations/2026_10_29_000001_crear_tablas_comunes.php` |
| API: Octane con 4 workers (`.rr.octane.yaml`). Worker: `.rr.yaml` con Temporal (cola `finanzas`) y el plugin `service` (D29) | raíz del servicio |

```bash
./probar.sh                       # 8 pruebas, Deptrac y Larastan (necesita el compose levantado)
docker compose -f ../../plataforma/compose/compose.yaml --profile core --profile plataforma up -d --build finanzas-api finanzas-worker
curl localhost:8103/health/ready
```
