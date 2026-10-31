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
- Reconexión propia, sin `connect_robust` (FC5): conecta, fija el `prefetch`, consume y espera a que se cierre la conexión o el canal; entonces vuelve a conectar con espera creciente (1 s a 30 s). `/health/ready` da `rabbitmq: DOWN` (503) mientras no hay consumidor.
- Inbox por `id` del sobre en la misma transacción que los hechos, las alertas y `datosAl` (el mayor `ocurridoEn`).
- Copias de `cliente`, `ruta` y `chofer` por `versionAgregado`; `hecho_viaje` se crea parcial si un evento llega antes que `ViajeConfirmado`; un estado final no retrocede.
- `hecho_conduccion` guarda frenadas y fatigas; el puntaje por cada 100 km se calcula al consultar `GET /api/v1/conduccion`.
- `hecho_combustible` calcula km/L contra la carga anterior del mismo tracto (la primera queda `SIN_REFERENCIA`) y pasa por Isolation Forest si el modelo está cargado.

## Alertas (T8.2)

- Fuentes de la tabla B de la spec 013. Una abierta por `(tipo, entidad)` (índice único parcial); un evento repetido no crea otra (Inbox). En los tipos que se resuelven solos cuenta también la `ATENDIDA`: una predicción nueva actualiza la `RIESGO_RETRASO` atendida en vez de abrir otra (migración 0003).
- Las alertas se crean de a una (bloqueo consultivo hasta el commit): el orden de `secuencia` es el de confirmación y el cursor no salta ninguna.
- Se resuelven solas: entrega observada (al rechazar, o con una `EntregaConfirmada` que trae `aprobadaPor`), intervención (al cancelar), riesgo de retraso (al terminar el viaje) y acción propuesta.
- `GET /api/v1/alertas` filtra por los roles del token, en orden de `secuencia`, con cursor opaco y la cifra `abiertas` de la campana. Sin estado, las abiertas y las cerradas de las últimas 24 h (D83).
- `POST /api/v1/alertas/{id}/atencion` con `Idempotency-Key` (`operacion_idempotente`): solo un rol de la alerta y nunca el gerente (403).

## Reportes y Excel (T8.3)

- Catálogo cerrado de 5 reportes (`app/dominio/reportes.py`): parámetros, roles, rango máximo (92 o 366 días) y columnas. `GET /api/v1/reportes` lo publica con el JSON Schema de cada uno (el MCP lo expone como `catalogo://reportes`).
- `GET /api/v1/reportes/{id}` valida rol y rango en código y calcula todo desde el modelo de lectura: montos como texto con 2 decimales, `totales`, datos del gráfico y `datosAl`. Máximo 500 filas en pantalla y 10.000 en Excel (D93); más → `400 VALIDACION` en el rango.
- `RENTABILIDAD` une Viajes (km, ruta), Finanzas (facturado) y Flota (combustible del viaje).
- `POST /api/v1/exportaciones` (con `Idempotency-Key`) corre el mismo reporte y guarda el `.xlsx` (hojas "Datos" y "Parámetros", openpyxl) 10 minutos; hasta 5 MB (D96). Un job borra las vencidas cada 5 min.
- `GET /api/v1/exportaciones/{id}/archivo` solo responde al token de servicio del `gateway` con `X-Solicitante-Sub` igual a quien la creó (D21); vencida → `404 EXPORTACION_VENCIDA`.

## Machine learning (T8.4)

- `ml/entrenar.py` entrena con la semilla fija desde `plataforma/datos-sinteticos` **en el build de la imagen** (los `.joblib` no se versionan) y falla si el recall de *retrasado* baja de 0,75 (D82). El notebook `notebooks/modelos.ipynb` corre el mismo código y muestra recall, matriz de confusión e importancias.
- **Retraso:** `GradientBoostingClassifier(random_state=42)` con pesos balanceados sobre las variables de D79; se recalcula con `ViajeIniciado`, `PosicionActualizada` y `HitoRegistrado` como máximo una vez por minuto (D78), y un job cada 60 s alcanza a los que quedaron atrás (tampoco fuerza: espera a que pase el minuto). Con probabilidad ≥ 0,70 abre (o actualiza) una sola `RIESGO_RETRASO`. Los 3 factores son las variables que más bajan la probabilidad al volver a su mediana.
- **Anomalías:** `IsolationForest(contamination=0.05, n_estimators=100, random_state=42)` sobre `[kmPorLitro, litros]`; la primera carga de un tracto queda `SIN_REFERENCIA`.
- Sin modelos (por ejemplo, en `uv run` sin entrenar), `obtenerRiesgoRetraso` responde `503 DEPENDENCIA_NO_DISPONIBLE` (spec 013) y no se crean alertas de ML. El mismo 503, con otro mensaje, si todavía falta la copia de la ruta o el inicio del viaje. Para entrenar en local: `uv run python -m ml.entrenar --datos ../../plataforma/datos-sinteticos --salida modelos`.

## Acciones propuestas y aviso al cliente (T8.6)

- `POST /api/v1/acciones` (solo `agente_lectura`, por el MCP): una por `(tipo, viaje)` salvo `ARCHIVADA` (índice único parcial). La repetida devuelve la existente con `creada = false`. El viaje tiene que estar `EN_RUTA` o `ENTREGA_OBSERVADA` y con probabilidad ≥ 0,70 o una `RIESGO_RETRASO` sin resolver; si no, `409 CONFLICTO_ESTADO` (FM2: una bitácora maliciosa no abre avisos para otros viajes). El destinatario tiene que ser el cliente del viaje (`422 DESTINATARIO_INVALIDO`, antes de buscar la existente). Hay como máximo 3 por misión (`X-Mision-Id`, D86): el id tiene que ser una misión `EN_CURSO` de la base (si no, `409 CONFLICTO_ESTADO`) y su fila se bloquea mientras se cuenta; sin la cabecera (opcional en el contrato) no hay misión que contar. Abre la alerta `ACCION_PROPUESTA`.
- Aprobar (solo `despachador`, con `Idempotency-Key`): en una transacción pasa a `APROBADA`, se audita y se escribe `AvisoClienteAprobado` en el `outbox`. El destinatario y el correo salen de la copia `cliente`; el asunto, de la plantilla; el enlace, de `PORTAL_URL`. Rechazar → `RECHAZADA`. El gerente recibe 403.
- El relay del Outbox (Python, cada 2 s) reclama con `SKIP LOCKED` y publica `mandatory` con confirmación del broker. Recién después marca publicado y pasa la acción a `EJECUTADA`; un mensaje sin ruta queda pendiente y la acción sigue `APROBADA`. El sobre lleva el `traceparent` de la aprobación. n8n (`aviso-cliente`) envía el correo una sola vez por `eventId`. Usa una conexión simple: si el broker la cierra, o una publicación falla o no se confirma en 10 s, la suelta y la vuelta siguiente abre otra.
- Un job cada 5 min archiva las `PENDIENTE` de más de 24 h o cuyo viaje terminó (D87).

## Agente "vigilar viajes" (T10.2, spec 014)

- Cada 10 min (`MISION_CADA_MINUTOS`) o con `POST /api/v1/agente/misiones` (despachador o gerente, con `Idempotency-Key`), que responde `202` con `{misionId}`. Corre una misión a la vez (bloqueo consultivo; la manual recibe `409`). Sin LLM queda `SALTADA` y la manual recibe `503 LLM_NO_DISPONIBLE` (FR4).
- El agente usa el token del cliente `agente` (*client credentials*) y consulta **solo** por el MCP (SDK `mcp` 2.x): `tools/list`, el prompt `mision_vigilar_viajes` y el recurso `vocabulario://negocio`. El LLM (Ollama, temperatura 0, `LLM_TURNO_S` por turno, 20 s según D85) elige herramientas hasta `FIN`, 8 pasos o 90 s (→ `AGOTADA`); los 90 s se cumplen también en medio de un turno o de una herramienta. A qwen3 también se le reconoce la llamada que escribe como JSON en el texto (uno o varios objetos, con texto alrededor).
- Cada paso se guarda en la misión apenas termina: herramienta, argumentos (sin el texto al cliente), resumen y ms. Lo ve el panel del agente. `traceId` es el de la traza real de la misión (vacío sin collector). Un reintento de `POST /agente/misiones` con la misma clave devuelve la misión ya disparada antes de mirar el LLM. `proponer_accion` viaja con `X-Mision-Id`, que limita a 3 acciones por misión.

## Consulta por voz (T10.3, spec 015)

- `POST /api/v1/voz/preguntas`: el LLM devuelve solo la intención en JSON (esquema completo en `format`). El código la valida en el orden de la spec: fuera del catálogo → `422 PREGUNTA_FUERA_DE_ALCANCE`; aclaración; rol → `403`; nombres a ids por coincidencia exacta o por prefijo de palabra ("agro" → 2 opciones); periodo a fechas y límites.
- El reporte se corre en Analítica con el mismo código que `GET /api/v1/reportes/{id}` y los roles del token (sin pasar por el MCP). La redacción usa un prompt fijo con las filas y los totales. Si el texto trae un número que no está en las filas o los totales, o el LLM no responde, se usa la plantilla ("8.400" no vale por 8.400,50).
- Cada opción de una `ACLARACION` trae parámetros completos (fechas del periodo o, si no sirven, las de por defecto del reporte): la pantalla la corre sin el LLM.
- La consulta tiene un límite de 20 peticiones por minuto y por `sub` (`VOZ_PETICIONES_POR_MINUTO`) → `429 LIMITE_PETICIONES` con `Retry-After`.

## Trazas y errores

- OpenTelemetry (D23) solo si `OTEL_EXPORTER_OTLP_ENDPOINT` está definido (OTLP/HTTP, `…/v1/traces`): FastAPI, httpx y SQLAlchemy, más un span por evento consumido (continúa el `traceparent` del sobre), por predicción, por alerta, por turno del LLM y por herramienta. Las llamadas al MCP y al LLM llevan `traceparent` y `X-Correlation-Id`.
- Un error inesperado responde `500` en Problem Details (`ERROR_INTERNO`) y queda en el log; una dependencia caída, `503` con `Retry-After`.
- Un cuerpo de más de 256 KB (con `Content-Length` o en trozos) responde `413` en Problem Details (`VALIDACION`).
- `/docs` y `/openapi.json` están apagados; `DOCUMENTACION_API=true` los enciende en local.
- En el Excel, un texto que empieza con `=`, `+`, `-`, `@`, tabulación o retorno de carro se guarda como texto (nunca como fórmula).

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
