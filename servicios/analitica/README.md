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

## Reportes y Excel (T8.3)

- Catálogo cerrado de 5 reportes (`app/dominio/reportes.py`): parámetros, roles, rango máximo (92 o 366 días) y columnas. `GET /api/v1/reportes` lo publica con el JSON Schema de cada uno (el MCP lo expone como `catalogo://reportes`).
- `GET /api/v1/reportes/{id}` valida rol y rango en código y calcula todo desde el modelo de lectura: montos como texto con 2 decimales, `totales`, datos del gráfico y `datosAl`. Máximo 500 filas en pantalla y 10.000 en Excel (D93); más → `400 VALIDACION` en el rango.
- `RENTABILIDAD` une Viajes (km, ruta), Finanzas (facturado) y Flota (combustible del viaje).
- `POST /api/v1/exportaciones` (con `Idempotency-Key`) corre el mismo reporte y guarda el `.xlsx` (hojas "Datos" y "Parámetros", openpyxl) 10 minutos; hasta 5 MB (D96). Un job borra las vencidas cada 5 min.
- `GET /api/v1/exportaciones/{id}/archivo` solo responde al token de servicio del `gateway` con `X-Solicitante-Sub` igual a quien la creó (D21); vencida → `404 EXPORTACION_VENCIDA`.

## Machine learning (T8.4)

- `ml/entrenar.py` entrena con la semilla fija desde `plataforma/datos-sinteticos` **en el build de la imagen** (los `.joblib` no se versionan) y falla si el recall de *retrasado* baja de 0,75 (D82). El notebook `notebooks/modelos.ipynb` corre el mismo código y muestra recall, matriz de confusión e importancias.
- **Retraso:** `GradientBoostingClassifier(random_state=42)` con pesos balanceados sobre las variables de D79; se recalcula con `ViajeIniciado`, `PosicionActualizada` y `HitoRegistrado` como máximo una vez por minuto (D78), y un job cada 60 s alcanza a los que quedaron atrás. Con probabilidad ≥ 0,70 abre (o actualiza) una sola `RIESGO_RETRASO`. Los 3 factores son las variables que más bajan la probabilidad al volver a su mediana.
- **Anomalías:** `IsolationForest(contamination=0.05, n_estimators=100, random_state=42)` sobre `[kmPorLitro, litros]`; la primera carga de un tracto queda `SIN_REFERENCIA`.
- Sin modelos (por ejemplo, en `uv run` sin entrenar), `obtenerRiesgoRetraso` responde `503 MODELO_NO_DISPONIBLE` y no se crean alertas de ML. Para entrenar en local: `uv run python -m ml.entrenar --datos ../../plataforma/datos-sinteticos --salida modelos`.

## Acciones propuestas y aviso al cliente (T8.6)

- `POST /api/v1/acciones` (solo `agente_lectura`, por el MCP): una por `(tipo, viaje)` salvo `ARCHIVADA` (índice único parcial). La repetida devuelve la existente con `creada = false`. El destinatario tiene que ser el cliente del viaje. Hay como máximo 3 por misión (`X-Mision-Id`, D86). Abre la alerta `ACCION_PROPUESTA`.
- Aprobar (solo `despachador`, con `Idempotency-Key`): en una transacción pasa a `APROBADA`, se audita y se escribe `AvisoClienteAprobado` en el `outbox`. El destinatario y el correo salen de la copia `cliente`; el asunto, de la plantilla; el enlace, de `PORTAL_URL`. Rechazar → `RECHAZADA`. El gerente recibe 403.
- El relay del Outbox (Python, cada 2 s) reclama con `SKIP LOCKED` y publica con confirmación del broker. Recién después marca publicado y pasa la acción a `EJECUTADA`. n8n (`aviso-cliente`) envía el correo una sola vez por `eventId`.
- Un job cada 5 min archiva las `PENDIENTE` de más de 24 h o cuyo viaje terminó (D87).

## Agente "vigilar viajes" (T10.2, spec 014)

- Cada 10 min (`MISION_CADA_MINUTOS`) o con `POST /api/v1/agente/misiones` (despachador o gerente, con `Idempotency-Key`), que responde `202` con `{misionId}`. Corre una misión a la vez (bloqueo consultivo; la manual recibe `409`). Sin LLM queda `SALTADA` y la manual recibe `503 LLM_NO_DISPONIBLE` (FR4).
- El agente usa el token del cliente `agente` (*client credentials*) y consulta **solo** por el MCP (SDK `mcp` 2.x): `tools/list`, el prompt `mision_vigilar_viajes` y el recurso `vocabulario://negocio`. El LLM (Ollama, temperatura 0, `LLM_TURNO_S` por turno, 20 s según D85) elige herramientas hasta `FIN`, 8 pasos o 90 s (→ `AGOTADA`). A qwen3 también se le reconoce la llamada que escribe como JSON en el texto.
- Cada paso queda en la misión: herramienta, argumentos (sin el texto al cliente), resumen y ms. Lo ve el panel del agente. `proponer_accion` viaja con `X-Mision-Id`, que limita a 3 acciones por misión.

## Consulta por voz (T10.3, spec 015)

- `POST /api/v1/voz/preguntas`: el LLM devuelve solo la intención en JSON (esquema completo en `format`). El código la valida en el orden de la spec: fuera del catálogo → `422 PREGUNTA_FUERA_DE_ALCANCE`; aclaración; rol → `403`; nombres a ids por coincidencia exacta o por prefijo de palabra ("agro" → 2 opciones); periodo a fechas y límites.
- El reporte se corre por el MCP (`ejecutar_reporte`) con el token del usuario **intercambiado otra vez** hacia `mcp-server`: cc-tablero → gateway → analitica → mcp-server → analitica. La redacción usa el prompt `redactar_respuesta_reporte`. Si el texto trae un número que no está en las filas o los totales, o el LLM no responde, se usa la plantilla.
- Plan B de K1 (`VOZ_CADENA=DOS_SALTOS`): `POST /voz/interpretaciones` y `POST /voz/redacciones`, y el Gateway llama al MCP.

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
