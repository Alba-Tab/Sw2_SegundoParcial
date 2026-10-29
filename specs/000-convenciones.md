# 000 · Convenciones transversales

Estado: **revisado** · Aplica a todos los servicios, apps y contratos.

Lo que dice este archivo vale para todo el monorepo. Una spec de flujo puede agregar reglas, pero no contradecir estas. Las decisiones que lo respaldan están en `specs/decisiones.md` (Dxx).

---

## 1. Identificadores

- Todo id de entidad es un **UUIDv7** en texto (`"0192f3a4-7c1e-7b2a-9d4f-3e8a1b2c4d5e"`). Ordena por fecha de creación y sirve como llave primaria.
- Lo genera el **servicio dueño** del dato, salvo las claves de idempotencia, que las genera el cliente (app, portal o Centro de Control).
- `servicioId` y `viajeId` los genera Viajes **antes** de iniciar el workflow; `servicioId` se devuelve en el `202`. La relación `Servicio`–`Viaje` es **1:1** (D03).
- Identificadores legibles solo donde el negocio los pide: factura `FAC-000123` (correlativo propio de Finanzas), placa de la unidad.

## 2. Fechas y horas

| Caso | Formato | Ejemplo |
|---|---|---|
| Instante | ISO-8601 en UTC con `Z` | `"2026-10-28T14:05:00Z"` |
| Fecha sin hora (fecha del viaje, vencimiento) | `YYYY-MM-DD`, interpretada en `America/La_Paz` | `"2026-11-03"` |
| Duración | ISO-8601 | `"PT24H"` |

- En la base se guarda en UTC (`timestamptz` en PostgreSQL, `Date` en Mongo).
- Las pantallas muestran la hora en `America/La_Paz`.
- La vigencia de la cotización es un instante (`venceEn`), no una fecha.

## 3. Dinero y cantidades

**Dinero** siempre como objeto, con el monto en texto decimal:

```json
{ "monto": "1250.00", "moneda": "BOB" }
```

| Dónde | Tipo |
|---|---|
| JSON | `string` decimal con 2 decimales, más `moneda` (ISO 4217) |
| PostgreSQL | `numeric(14,2)` |
| MongoDB | `Decimal128` |
| Java | `BigDecimal` |
| PHP | `Brick\Money\Money` dentro del value object `Monto` |
| TypeScript | `string` en el transporte; aritmética con una librería decimal, nunca `number` |
| Python | `decimal.Decimal` |

- Redondeo: `HALF_UP` a 2 decimales, solo al final del cálculo.
- Moneda única por ahora: `BOB`. El campo existe para no cambiar el contrato después.
- Un monto negativo se rechaza en el value object, no en el controlador.

**Cantidades físicas** como número JSON, con la unidad en el nombre del campo: `toneladas`, `litros`, `kilometraje`, `km`, `radioMetros`.

**Coordenadas:** `{ "lat": -17.7833, "lng": -63.1821 }`, WGS84 en grados decimales.

## 4. APIs REST

- Prefijo: `/api/v1`. Recursos en plural y en español: `/api/v1/servicios`, `/api/v1/viajes/{viajeId}/hitos`.
- JSON en `camelCase`. Los enums van en `MAYUSCULAS_CON_GUION_BAJO` (`EN_RUTA`).
- Cada servicio publica su OpenAPI en `contratos/openapi/<servicio>.yaml`; el código se valida contra ese archivo.
- Salud: `GET /health` (vivo) y `GET /health/ready` (dependencias listas). Sin autenticación.

**Encabezados**

| Encabezado | Quién lo envía | Regla |
|---|---|---|
| `Authorization: Bearer <token>` | Todo cliente | Obligatorio salvo `/health` |
| `Idempotency-Key: <uuid>` | Cliente, en toda operación que puede reenviarse | Obligatorio en `POST` de negocio; ver 4.1 |
| `X-Correlation-Id: <uuid>` | El primero que recibe la petición, si no viene | Se propaga a todo lo que la petición dispare |
| `traceparent` | W3C Trace Context | Se propaga igual que el anterior |

**Paginación por cursor**

```
GET /api/v1/viajes?limite=50&cursor=<opaco>
→ { "items": [...], "siguienteCursor": "<opaco>" | null }
```

`limite` por defecto 20, máximo 100.

**Códigos de estado**

| Código | Cuándo |
|---|---|
| `200` / `201` | Éxito; `201` con `Location` al crear |
| `202` | Aceptado y en proceso (inicio de la saga) |
| `400` | Petición mal formada o validación de campos |
| `401` | Sin token o token inválido |
| `403` | Token válido, pero sin permiso sobre ese recurso o esa fila |
| `404` | No existe. Si existe pero es de otro cliente, se responde `403` (sección 6.4 de la propuesta) |
| `409` | Conflicto de estado (bloqueo semántico, versión optimista) o la misma clave de idempotencia todavía en proceso |
| `422` | Regla de negocio violada, o misma `Idempotency-Key` con otro cuerpo |
| `429` | Límite de peticiones |
| `503` | Dependencia caída; incluir `Retry-After` |

### 4.1 Idempotencia

- La clave es un UUID generado por el cliente **por intento**. Si la saga falló y el usuario vuelve a confirmar, es una clave nueva.
- La autoridad guarda: clave, tipo de operación, hash SHA-256 del cuerpo, estado (`EN_PROCESO`, `COMPLETADA`), código y cuerpo de la respuesta.
- Reenvío con la misma clave y el mismo cuerpo: se devuelve la respuesta guardada, con el mismo código.
- Misma clave, otro cuerpo: `422` con código `IDEMPOTENCIA_CUERPO_DISTINTO`.
- Misma clave mientras la primera sigue `EN_PROCESO`: `409` con código `IDEMPOTENCIA_EN_PROCESO`.
- Tabla en PostgreSQL: `operacion_idempotente`. En Flota (Mongo): índice único sobre `opId`.
- **Excepción: `POST /api/v1/servicios`** (D43). Con la misma clave y el mismo hash todavía `EN_PROCESO`, Viajes vuelve a llamar `start` con el `workflowId` guardado; `WorkflowExecutionAlreadyStarted` cuenta como éxito y responde `202` con el mismo `servicioId`. Es seguro porque iniciar el workflow es idempotente. Las demás operaciones siguen respondiendo `409`.

## 5. Errores

Formato **Problem Details (RFC 9457)**, `Content-Type: application/problem+json`:

```json
{
  "type": "https://transporte.local/errores/credito-insuficiente",
  "title": "Crédito insuficiente",
  "status": 422,
  "detail": "El disponible es 800.00 BOB y el servicio cuesta 1250.00 BOB.",
  "codigo": "CREDITO_INSUFICIENTE",
  "correlationId": "0192f3a4-...",
  "errores": [ { "campo": "toneladas", "mensaje": "Debe ser mayor que 0" } ]
}
```

- `codigo` es estable y es lo que el frontend usa para decidir; `title` y `detail` son para personas.
- `errores` solo en validación (`400`).
- Nunca se devuelven trazas de pila ni mensajes del motor de base de datos.

**Catálogo inicial de códigos.** Se comparten con los tipos de `ApplicationFailure` de Temporal (sección 7).

| Código | Estado HTTP | ¿Reintentable en la saga? |
|---|---|---|
| `VALIDACION` | 400 | No |
| `NO_AUTENTICADO` | 401 | — |
| `SIN_PERMISO` | 403 | — |
| `NO_ENCONTRADO` | 404 | No |
| `CONFLICTO_ESTADO` | 409 | No |
| `VERSION_DESACTUALIZADA` | 409 | Sí |
| `IDEMPOTENCIA_EN_PROCESO` | 409 | — |
| `IDEMPOTENCIA_CUERPO_DISTINTO` | 422 | — |
| `COTIZACION_VENCIDA` | 422 | No |
| `COTIZACION_AJENA` | 403 | No |
| `CREDITO_INSUFICIENTE` | 422 | No |
| `CREDITO_RECHAZADO` | 422 | No |
| `SIN_UNIDAD_COMPATIBLE` | 422 | No |
| `CLIENTE_NO_REPLICADO` | 503 | Sí |
| `DEPENDENCIA_NO_DISPONIBLE` | 503 | Sí |
| `TONELAJE_EXCEDIDO` | 422 | No |
| `APROBACION_VENCIDA` | 422 | No |
| `CONFIRMACION_EN_CURSO` | 409 | — |
| `CANCELACION_NO_PERMITIDA` | 409 | — |
| `VINCULACION_PENDIENTE` | 503 | — |
| `LLM_NO_DISPONIBLE` | 503 | — |
| `PREGUNTA_FUERA_DE_ALCANCE` | 422 | — |
| `RESUELTO_MANUALMENTE` | — | — (motivo de cancelación de la saga, no se devuelve por HTTP; spec 011) |
| `CANCELADO_POR_USUARIO` | — | — (motivo de `ViajeCancelado` con `origen = USUARIO`; el texto del usuario va en `detalle`; spec 004) |

Cada spec agrega los suyos aquí, en la misma tabla.

## 6. Eventos (RabbitMQ)

**Sobre común**

```json
{
  "id": "0192f3a4-...",
  "tipo": "EntregaConfirmada",
  "version": 1,
  "ocurridoEn": "2026-10-28T14:05:00Z",
  "correlationId": "0192f3a4-...",
  "traceparent": "00-...-...-01",
  "productor": "viajes",
  "datos": { }
}
```

- Exchange: `transporte.events`, tipo `topic`, durable.
- Clave de enrutamiento: `<contexto>.<evento-en-kebab>.v<n>`, por ejemplo `viajes.entrega-confirmada.v1`, `finanzas.factura-emitida.v1`.
- Colas: una por consumidor, `<consumidor>.eventos` (por ejemplo `finanzas.eventos`), con sus *bindings* a las claves que le interesan. Colas **quorum** con `delivery-limit` y cola de fallidos `<consumidor>.eventos.dlq`.
- Esquema de cada evento: `contratos/eventos/<contexto>/<Evento>.v<n>.schema.json`. El productor valida antes de escribir en el Outbox.
- **Cambios compatibles** (agregar un campo opcional): misma versión. **Cambios incompatibles**: versión nueva, y se publican las dos mientras haya consumidores de la anterior.
- **Copias de datos** (`ClienteActualizado`, `RutaActualizada`, `ChoferActualizado`): `datos` lleva `versionAgregado`; el consumidor descarta un evento con versión menor o igual a la que ya tiene.
- Los eventos que consume n8n traen ya resuelto todo lo que el correo necesita (destinatario, nombre, enlace): n8n no consulta servicios.
- **Outbox:** tabla `outbox_eventos` (o colección en Mongo) en la misma transacción que el cambio; un relay la publica con confirmación del broker y marca `publicadoEn`.
- **Inbox:** tabla `inbox_eventos` con `eventId` como llave primaria, en la misma transacción que el efecto del consumidor.

## 7. Temporal

- Namespace: `transporte`. Retención: 30 días (D14).
- Colas de tareas: `viajes`, `finanzas`, `flota`.
- Id del workflow: `programar-viaje-<servicioId>`, con `REJECT_DUPLICATE` y conflicto `FAIL`. La autoridad de idempotencia del endpoint sigue siendo `operacion_idempotente` (4.1).
- Nombres de actividades explícitos, `<Contexto>.<verbo>`: `Finanzas.validarYReservarCredito`, `Flota.reservarUnidad`. Nunca el nombre por defecto que genera cada SDK.
- Payloads: JSON con las mismas reglas de este archivo (camelCase, UUID en texto, dinero como objeto, instantes en UTC).
- **Determinismo:** el workflow nunca lee variables de entorno ni la hora del sistema. Los valores configurables (espera de aprobación, timeouts e intentos de las compensaciones, valores de demo) llegan en la entrada como `parametrosSaga`, que arma la API de Viajes.
- Errores de negocio: `ApplicationFailure` con `type` igual al `codigo` de la sección 5 y `nonRetryable` según esa tabla.
- Cambios en el workflow con ejecuciones abiertas: `Workflow.getVersion`.
- Entradas, salidas, señales, consultas, timeouts y reintentos de cada actividad: `contratos/temporal/programar-viaje.md`.

## 8. Identidad y permisos

Claims que usan los servicios:

| Claim | Uso |
|---|---|
| `sub` | Usuario. El chofer ve solo los viajes con su `sub` |
| `realm_access.roles` | Roles: `chofer`, `despachador`, `jefe_flota`, `administracion`, `gerente`, `comercial`, `cliente`, `agente_lectura` |
| `clienteId` | Cliente del usuario con rol `cliente`. Con ese rol, se ignora cualquier `clienteId` que venga por parámetro |
| `aud` | El servicio rechaza un token que no lo tenga en la audiencia |
| `azp` | Qué app hizo la petición; solo para auditoría |

- Con rol `comercial`, el cliente sale del parámetro y se registra `canal = TELEFONO`. Cualquier otro caso sin `clienteId` válido: `403`.
- Llamadas entre servicios con usuario: intercambio de token (RFC 8693). Sin usuario (agente, consumidores): client credentials.

## 9. Bases de datos

- Tablas y columnas en `snake_case`, en español, sin tildes: `linea_credito`, `ultima_posicion`.
- Colecciones de Mongo en `camelCase` plural: `cargasCombustible`.
- Migraciones versionadas por servicio: Flyway (Viajes), migraciones de Laravel (Finanzas), Alembic (Analítica). Nunca cambiar una migración ya aplicada.
- Bloqueo optimista con columna `version` en los agregados que lo necesitan (`LineaCredito`).
- Tablas comunes con el mismo nombre en todos los servicios: `operacion_idempotente`, `outbox_eventos`, `inbox_eventos`, `auditoria`.

**Esquema de auditoría** (igual en todos los servicios): `id`, `ocurridoEn`, `actorSub`, `actorRol`, `canal` (`PORTAL`, `TELEFONO`, `CENTRO_CONTROL`, `APP_CHOFER`, `SISTEMA`), `accion`, `entidad`, `entidadId`, `datos` (JSON), `correlationId`.

## 10. Logs y trazas

- Logs en JSON, una línea por evento, con: `timestamp`, `nivel`, `servicio`, `correlationId`, `traceId`, `mensaje`.
- Nunca se registran tokens, contraseñas, firmas, fotos ni el cuerpo completo de las peticiones.
- Trazas (D23): en local, OpenTelemetry Collector + Jaeger en el perfil `trazas` de docker compose; cada servicio exporta si `OTEL_EXPORTER_OTLP_ENDPOINT` está definido. En la nube, logs con `correlationId` y `traceparent`.

## 11. Configuración

- Variables de entorno en `MAYUSCULAS_CON_GUION_BAJO`. Cada servicio trae su `.env.example` con todas sus variables y valores de ejemplo para local.
- Lo que cambia entre local y nube va en variables, nunca en código: URL de bases, `AWS_ENDPOINT_URL`, `TEMPORAL_ADDRESS`, `AMQP_URL`, `OIDC_ISSUER`, `LLM_BASE_URL`, `LLM_MODEL` (tabla de la sección 8 del análisis).
- Los secretos en la nube viven en GitHub Environments y en el gestor de cada nube.

## 12. Git

- Ramas fijas: `main` (despliegue, protegida) y `develop` (integración). Nadie trabaja directo en ellas.
- Toda rama de trabajo sale de `develop`, se publica rastreada (`git push -u origin <rama>`) y vuelve a `develop` por PR. `develop` pasa a `main` por PR para desplegar.
- Nombre de rama: `<tipo>/<pieza>/<que-se-hizo>`, que dice dónde se trabajó y qué se hizo: `feat/viajes/alta-cliente`, `fix/flota/liberar-reserva`, `docs/specs/programar-viaje`.
- Commits por feature con Conventional Commits y la pieza como alcance: `feat(viajes): crea el viaje en PROGRAMANDO`, `docs(specs): agrega 003-programar-viaje`.
- Sin coautorías ni firmas en commits ni PR (`Co-Authored-By`, "Generated with…"). commitlint lo verifica en local y en `ci-ok`.
- **Excepción:** las ramas de prueba de concepto `chore/<pieza>/poc-*` no se mergean; lo que sirve entra por otra rama, y se borran al cerrar el hito H2.
- Un cambio de contrato y sus productores/consumidores van en el mismo PR.

---

## Formato de las specs

Cada archivo `specs/NNN-<flujo>.md` sigue esta plantilla:

```markdown
# NNN · <Nombre del flujo>

Estado: borrador | revisado | implementado · Casos de uso: CU-xx · Responsable: <nombre>

## Actores y roles
## Precondiciones
## Pasos (camino feliz)
## Reglas de negocio (con valores concretos)
## Estados que cambia
## Contratos que toca
- REST: contratos/openapi/<servicio>.yaml#<operación>
- Eventos: <Evento>.v1
- Temporal: <actividad / señal>
- GraphQL: <query / mutation>
## Errores y caminos alternativos (con su código de la sección 5)
## Criterios de aceptación
- Dado … Cuando … Entonces …
## Cómo se demuestra en la defensa
```
