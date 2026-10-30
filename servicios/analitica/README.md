# Analítica

Servicio de apoyo (no es un microservicio de dominio): Python 3.13 con FastAPI, base propia `analitica` (PostgreSQL) y
consumidor de `analitica.eventos`. Es la única fuente de alertas del Centro de Control (spec 013), calcula los reportes
(spec 015), corre los dos modelos de ML y guarda las acciones del agente (spec 014). Contrato:
[`contratos/openapi/analitica.yaml`](../../contratos/openapi/analitica.yaml).

## Capas

| Carpeta | Qué hay | Regla |
|---|---|---|
| `app/dominio` | Alertas (roles, severidad, quién atiende), puntaje de conducción (D84), km/L, variables del riesgo (D79, D80) | Python puro: import-linter prohíbe FastAPI, SQLAlchemy, aio-pika y httpx |
| `app/aplicacion` | Proyecciones de eventos con Inbox, alertas, predicción, idempotencia, consultas | No conoce la API |
| `app/infraestructura` | Tablas (SQLAlchemy), consumidor AMQP, validación de eventos con los JSON Schema de `contratos/`, modelos `.joblib`, tareas periódicas | |
| `app/api` | Rutas, token de Keycloak (audiencia `analitica`), Problem Details | |
| `migraciones` | Alembic | |

## Modelo de lectura (T8.1)

- Cada evento se valida contra su contrato; inválido o sin manejador → `analitica.eventos.dlq`. Una falla de la base se reencola (la cola de quórum lo manda a la DLQ a las 5 entregas).
- Inbox por `id` del sobre en la misma transacción que los hechos, las alertas y `datosAl` (el mayor `ocurridoEn`).
- Copias de `cliente`, `ruta` y `chofer` por `versionAgregado`; `hecho_viaje` se crea parcial si un evento llega antes que `ViajeConfirmado`; un estado final no retrocede.
- `hecho_conduccion` guarda frenadas y fatigas; el puntaje por cada 100 km se calcula al consultar `GET /api/v1/conduccion`.
- `hecho_combustible` calcula km/L contra la carga anterior del mismo tracto (la primera queda `SIN_REFERENCIA`) y pasa por Isolation Forest si el modelo está cargado.

## Alertas (T8.2)

- Fuentes de la tabla B de la spec 013. Una abierta por `(tipo, entidad)` (índice único parcial); un evento repetido no crea otra (Inbox).
- Se resuelven solas: entrega observada (al aprobar o rechazar), intervención (al cancelar), riesgo de retraso (al terminar el viaje) y acción propuesta.
- `GET /api/v1/alertas` filtra por los roles del token, en orden de `secuencia`, con cursor opaco y la cifra `abiertas` de la campana. Sin estado, las abiertas y las cerradas de las últimas 24 h (D83).
- `POST /api/v1/alertas/{id}/atencion` con `Idempotency-Key` (`operacion_idempotente`): solo un rol de la alerta y nunca el gerente (403).

## Correr

```bash
uv sync
uv run pytest -q                     # PostgreSQL real con Testcontainers (Docker)
uv run ruff check . && uv run ruff format --check . && uv run lint-imports
```

Con el resto del sistema (perfil `ia` de `plataforma/compose`):

```bash
docker compose --profile core --profile plataforma --profile ia up -d analitica
curl localhost:8104/health/ready
```

En OrbStack, Testcontainers necesita `DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock TESTCONTAINERS_RYUK_DISABLED=true`.
