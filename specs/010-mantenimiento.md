# 010 · Unidades y mantenimiento

Estado: **revisado** · Casos de uso: CU-09 Gestionar unidades, CU-10 Programar mantenimiento · Responsable: Brayan Albaro Garcia Taboada

El jefe de flota da de alta y edita tractos y remolques, con atributos distintos según el tipo (Mongo encaja aquí, requisito 4). Al liberar una unidad, Flota suma los kilómetros del viaje y revisa el mantenimiento y los documentos; si corresponde, la pasa a `MANTENIMIENTO_PENDIENTE` y publica `MantenimientoRequerido`, y desde ese momento la saga ya no puede reservarla. El jefe de flota programa el mantenimiento (`EN_MANTENIMIENTO`) y al cerrarlo la unidad vuelve a `DISPONIBLE`. Decisiones: D07, D11, D20. Propuesta 3.1 (Flota, Clean), 5.0 y 5.12.

## Actores y roles

| Actor | Rol | Qué hace |
|---|---|---|
| Jefe de flota | `jefe_flota` | Alta, edición y baja de unidades; programa y cierra mantenimientos (cc-flota) |
| Despachador, gerente | `despachador`, `gerente` | Lectura |
| Agente | `agente_lectura` | `obtener_estado_unidad` por MCP (spec 014) |
| Flota (consumidor) | — | Suma km y revisa al consumir `EntregaConfirmada` y `EntregaRechazada` |
| Analítica | — | Alerta `MANTENIMIENTO_REQUERIDO` (spec 013) |

## Precondiciones

- Semilla (T4.8, `plataforma/semilla/unidades.json`, cargada directo sin eventos, D102): 5 tractos (`4521KTR` con odómetro 184.000 km y sin cargas previas); 3 furgones (uno con 9.950 km desde su último mantenimiento); 2 plataformas; 1 cisterna en `MANTENIMIENTO_PENDIENTE`.

## Pasos

**A. Gestionar unidades (CU-09)**

1. Alta: `POST /api/v1/unidades` con `{tipoUnidad, placa, tipoRemolque?, capacidadToneladas?, kilometraje? (solo tractos), kmDesdeUltimoMantenimiento, documentos: [{tipo, venceEl}], atributos}` e `Idempotency-Key`. Flota valida `atributos` con el esquema zod del tipo, crea la unidad `DISPONIBLE` (o `MANTENIMIENTO_PENDIENTE` si ya cumple la regla de la sección C) y responde `201`.
2. Edición: `PUT /api/v1/unidades/{unidadId}` con el documento completo salvo `estado`, `placa`, `kilometraje` y `kmDesdeUltimoMantenimiento` (esos dos solo cambian por viajes, cargas y mantenimientos) e `Idempotency-Key`; si vienen → `400 VALIDACION`. Si se renuevan documentos de una unidad `MANTENIMIENTO_PENDIENTE` cuyo único motivo eran ellos, vuelve a `DISPONIBLE`.
3. Baja: `POST /api/v1/unidades/{unidadId}/baja` con `{motivo}` → `INACTIVA` (final).

**B. Revisión al liberar (D07)**

4. Flota consume `EntregaConfirmada` o `EntregaRechazada` (specs 006 y 007), con Inbox. En una transacción: reserva de unidad → `LIBERADA`; al tracto y al remolque les suma `kmRecorridos` en `kmDesdeUltimoMantenimiento` (el `kilometraje` del odómetro no se toca); evalúa la regla C para cada uno; pasa a `DISPONIBLE` o a `MANTENIMIENTO_PENDIENTE` desde `EN_VIAJE`, **o desde `RESERVADA`** si el `ViajeIniciado` todavía no llegó (las colas no garantizan orden entre eventos); si es lo segundo, deja `MantenimientoRequerido` en el Outbox con `motivos`, `kmDesdeUltimo` y `documentoVenceEl`. Un `ViajeIniciado` que llega después, sobre una reserva ya `LIBERADA`, **se ignora** (no pasa la unidad a `EN_VIAJE`).
5. **Revisión diaria (D75):** a las 06:00 `America/La_Paz`, un job revisa los documentos de las unidades `DISPONIBLE` (los documentos vencen aunque la unidad no viaje) y aplica la misma regla.

**C. Regla de mantenimiento**

| Motivo (`MantenimientoRequerido.motivos`) | Condición |
|---|---|
| `KILOMETRAJE` | `kmDesdeUltimoMantenimiento ≥ 10.000` (D07) |
| `SOAT` | Documento `SOAT` con `venceEl − hoy ≤ 15 días` (D07) |
| `INSPECCION` | Documento `INSPECCION_TECNICA` con `venceEl − hoy ≤ 15 días` (D07) |

**D. Choferes y `ChoferActualizado`**

No hay API de escritura de choferes (su gestión queda fuera de las pantallas). Los 4 choferes vienen de la semilla compartida `plataforma/semilla/choferes.json` (T4.8) con `versionAgregado = 1`; Flota y Analítica la cargan cada una directo en su base, **sin eventos** (D102, spec 013). Un cambio posterior (licencia, vencimiento, `activo`) se hace con el comando `choferes:actualizar` de la CLI de Nest: Flota guarda el chofer, sube `versionAgregado` y deja `ChoferActualizado` en su Outbox **en la misma transacción**; Analítica descarta versiones menores o iguales (000 §6).

**E. Programar y cerrar (CU-10)**

6. El jefe de flota ve la alerta (spec 013) y programa: `POST /api/v1/unidades/{unidadId}/mantenimientos` con `{tipo, fechaProgramada, taller, descripcion, checklist: [{item}]}` e `Idempotency-Key`. Flota crea el `Mantenimiento` `EN_CURSO` y la unidad pasa a `EN_MANTENIMIENTO`. cc-flota guarda el borrador del checklist en IndexedDB mientras se llena (propuesta 6.6), pero el envío requiere conexión.
7. Al terminar: `POST /api/v1/mantenimientos/{mantenimientoId}/cierre` con `{kilometraje? (solo tractos), checklist: [{item, ok, nota}], observaciones, documentosRenovados: [{tipo, venceEl}]}` e `Idempotency-Key`. En una transacción: `Mantenimiento` → `CERRADO`; si `tipo` es `PREVENTIVO` o `CORRECTIVO`, `kmDesdeUltimoMantenimiento = 0`; aplica los documentos renovados; vuelve a evaluar la regla C: si ya no corresponde, la unidad queda `DISPONIBLE`; si todavía corresponde, `MANTENIMIENTO_PENDIENTE` con otro `MantenimientoRequerido`.

## Reglas de negocio

| Regla | Valor |
|---|---|
| Quién escribe | Solo `jefe_flota`; otro rol → `403 SIN_PERMISO` |
| Placa | `^[0-9]{3,4}[A-Z]{3}$` (formato boliviano, como en el contrato de Temporal); única → `409 PLACA_DUPLICADA` |
| Atributos por tipo (esquema zod) | `TRACTO`: `capacidadTanqueLitros` (100 a 1.500), `potenciaHp` opcional. `FURGON`: `volumenM3` (10 a 120). `PLATAFORMA`: `largoMetros` (6 a 15). `CISTERNA`: `compartimentos` (1 a 6) y `capacidadLitros` (5.000 a 45.000). Valores de D76; un campo de otro tipo → `400 VALIDACION` |
| Capacidad | `capacidadToneladas` obligatoria en remolques, > 0 y ≤ 30 (D03) |
| Documentos | `SOAT` e `INSPECCION_TECNICA` obligatorios, uno de cada uno |
| Bloqueo semántico | Una unidad `RESERVADA` o `EN_VIAJE` no se edita, no se da de baja y no entra a mantenimiento → `409 CONFLICTO_ESTADO` (spec 003). Una `EN_MANTENIMIENTO` solo se cierra |
| Programar | Desde `DISPONIBLE` (preventivo voluntario) o `MANTENIMIENTO_PENDIENTE`; desde otro estado → `409 CONFLICTO_ESTADO`. Un solo mantenimiento `EN_CURSO` por unidad |
| `tipo` de mantenimiento | `PREVENTIVO`, `CORRECTIVO` o `DOCUMENTOS` (este último no reinicia los km) |
| `fechaProgramada` | Hoy o después; `taller` 3 a 120 caracteres; checklist de 1 a 30 ítems |
| Cierre | `kilometraje` obligatorio en tractos y prohibido en remolques (`400 VALIDACION`); en el tracto debe ser ≥ el actual (`422 KILOMETRAJE_INVALIDO`) y se guarda. El checklist debe traer **todos** los ítems programados, cada uno con `ok = true`; un ítem faltante o con `ok = false` → `400 VALIDACION` y el mantenimiento sigue `EN_CURSO` hasta resolverlo |
| Kilómetros | `kilometraje`: odómetro, **solo tractos**; lo informan el alta, las cargas de combustible (spec 009) y el cierre; nunca baja. `kmDesdeUltimoMantenimiento`: tractos y remolques; suma `kmRecorridos` (D07) de cada viaje y vuelve a 0 al cerrar un `PREVENTIVO` o `CORRECTIVO`. La regla `KILOMETRAJE` usa solo este último |
| Reserva en la saga | Solo `DISPONIBLE` con SOAT e inspección vigentes (spec 003); `MANTENIMIENTO_PENDIENTE` y `EN_MANTENIMIENTO` nunca se reservan |
| Idempotencia | `Idempotency-Key` en todo `POST`/`PUT`. Autoridad en Flota: colección `operacion_idempotente` con índice único `opId` (000 §4.1 y §9), en la misma transacción que el cambio. Las cargas de combustible usan su propio `opId` (spec 009) |
| Inbox | `inbox_eventos` con `eventId` único: el mismo `EntregaConfirmada` no suma km dos veces |
| Mapeo de nombres | El documento se llama `INSPECCION_TECNICA` (`flota.yaml`) y el motivo `INSPECCION` (`MantenimientoRequerido`); Flota traduce |

### Máquina de estados de la Unidad (Flota; propuesta 5.0)

| Desde | Hacia | Cuándo | Spec |
|---|---|---|---|
| — | `DISPONIBLE` o `MANTENIMIENTO_PENDIENTE` | Alta | 010 |
| `DISPONIBLE` | `RESERVADA` | `Flota.reservarUnidad` | 003 |
| `RESERVADA` | `DISPONIBLE` | Liberación por compensación o `ViajeCancelado` | 003, 004 |
| `RESERVADA` | `EN_VIAJE` | `ViajeIniciado` (D20), solo si la reserva sigue activa | 005 |
| `RESERVADA` | `DISPONIBLE` o `MANTENIMIENTO_PENDIENTE` | `EntregaConfirmada` o `EntregaRechazada` antes que `ViajeIniciado` | 010 |
| `EN_VIAJE` | `DISPONIBLE` o `MANTENIMIENTO_PENDIENTE` | `EntregaConfirmada` o `EntregaRechazada` | 006, 007, 010 |
| `DISPONIBLE` | `MANTENIMIENTO_PENDIENTE` | Revisión diaria de documentos | 010 |
| `MANTENIMIENTO_PENDIENTE` | `DISPONIBLE` | Documentos renovados por edición | 010 |
| `DISPONIBLE`, `MANTENIMIENTO_PENDIENTE` | `EN_MANTENIMIENTO` | Programar | 010 |
| `EN_MANTENIMIENTO` | `DISPONIBLE` o `MANTENIMIENTO_PENDIENTE` | Cerrar | 010 |
| `DISPONIBLE`, `MANTENIMIENTO_PENDIENTE` | `INACTIVA` | Baja | 010 |

`INACTIVA` es final. Otra transición → `409 CONFLICTO_ESTADO`. El `Mantenimiento` pasa de `EN_CURSO` a `CERRADO`.

## Estados que cambia

| Entidad | Cambio |
|---|---|
| Tracto y remolque | La máquina de arriba; `kilometraje` y `kmDesdeUltimoMantenimiento` |
| `Mantenimiento` | — → `EN_CURSO` → `CERRADO` |
| `ReservaUnidad` | `CONFIRMADA` → `LIBERADA` al consumir la entrega |

## Contratos que toca

- REST `contratos/openapi/flota.yaml` (nuevas): `crearUnidad` (`POST /api/v1/unidades`), `actualizarUnidad` (`PUT /api/v1/unidades/{unidadId}`), `darDeBajaUnidad` (`POST /api/v1/unidades/{unidadId}/baja`), `programarMantenimiento` (`POST /api/v1/unidades/{unidadId}/mantenimientos`), `cerrarMantenimiento` (`POST /api/v1/mantenimientos/{mantenimientoId}/cierre`), `listarMantenimientos` (`GET /api/v1/mantenimientos?unidadId&estado&cursor`). Escrituras solo `jefe_flota`, con `Idempotency-Key`; respuestas `200`/`201`, `400`, `401`, `403`, `404`, `409`, `422`, `503`. `listarUnidades` (ya existe) suma el filtro `placa` (spec 014).
- Eventos: consume `ViajeCancelado.v1` (spec 004), `ViajeIniciado.v1`, `EntregaConfirmada.v1` y `EntregaRechazada.v1`; publica `MantenimientoRequerido.v1` y `ChoferActualizado.v1`. Sin cambios.
- GraphQL (F9): `programarMantenimiento`, `cerrarMantenimiento`, `unidades(filtro)`. Cada mutación lleva el argumento `claveIdempotencia: ID!`, que el Gateway reenvía como `Idempotency-Key` (spec 016).

## Errores y caminos alternativos

| Caso | Respuesta |
|---|---|
| Placa repetida | `409 PLACA_DUPLICADA` |
| Atributos de otro tipo (p. ej. `compartimentos` en un furgón) | `400 VALIDACION` con el campo |
| Editar o programar una unidad `EN_VIAJE` | `409 CONFLICTO_ESTADO` |
| Cerrar un mantenimiento ya cerrado con otra clave | `409 CONFLICTO_ESTADO` |
| Flota detenida al entregar | `EntregaConfirmada` espera en `flota.eventos`; los km se suman al volver |
| Evento repetido | Inbox: se ignora |

## Criterios de aceptación

- **FF3. Dado** el furgón con 9.950 km desde su último mantenimiento asignado al viaje del Aula (D11 lo elige por tener más km), **cuando** se confirma la entrega (+120 km), **entonces** queda con `kmDesdeUltimoMantenimiento = 10070` (no es el odómetro), en `MANTENIMIENTO_PENDIENTE`, y se publica `MantenimientoRequerido` con `motivos = [KILOMETRAJE]` y `kmDesdeUltimo = 10070`; **y cuando** se confirma otro servicio de granos, **entonces** la saga elige otro furgón.
- **Dado** un tracto con SOAT que vence en 10 días, **cuando** termina su viaje, **entonces** `MANTENIMIENTO_PENDIENTE` con `motivos = [SOAT]` y `documentoVenceEl`.
- **Dado** esa unidad, **cuando** el jefe de flota renueva el SOAT por un año con `PUT`, **entonces** vuelve a `DISPONIBLE`.
- **Dado** el furgón en `MANTENIMIENTO_PENDIENTE`, **cuando** se programa un `PREVENTIVO` y luego se cierra con el checklist completo, **entonces** pasa por `EN_MANTENIMIENTO`, termina `DISPONIBLE` con `kmDesdeUltimoMantenimiento = 0`.
- **FF4 (cisterna y furgón). Dado** una cisterna con `{compartimentos: 3, capacidadLitros: 30000}` y un furgón con `{volumenM3: 85}`, **cuando** se leen con `GET /unidades/{id}`, **entonces** cada documento trae sus propios campos; **y dado** un furgón con `compartimentos`, **entonces** `400 VALIDACION`.
- **FS4 (semilla). Dado** la cisterna en `MANTENIMIENTO_PENDIENTE`, **entonces** `Flota.reservarUnidad` la descarta (spec 003).
- **Dado** el mismo `EntregaConfirmada` entregado dos veces, **entonces** los km se suman una vez.
- **Dado** que `EntregaConfirmada` llega antes que `ViajeIniciado`, **entonces** la unidad pasa de `RESERVADA` a `DISPONIBLE` (o `MANTENIMIENTO_PENDIENTE`) y el `ViajeIniciado` atrasado se ignora.
- **Dado** un cierre con un ítem del checklist en `ok = false`, **entonces** `400 VALIDACION` y el mantenimiento sigue `EN_CURSO`.
- **Dado** un usuario `despachador`, **cuando** intenta programar un mantenimiento, **entonces** `403 SIN_PERMISO`.

## Cómo se demuestra en la defensa

FF3 dentro del paso 6 del escenario: tras la entrega del Aula, cc-flota muestra el furgón en `MANTENIMIENTO_PENDIENTE` con su alerta; se confirma otro servicio de granos y la Temporal UI muestra que `Flota.reservarUnidad` eligió otra placa. Luego el jefe de flota programa y cierra el mantenimiento. FF4: se abren la cisterna y el furgón en cc-flota y en MongoDB Compass para ver los campos distintos.

## Cambios de contrato pendientes

| Contrato | Cambio | Tipo |
|---|---|---|
| `contratos/openapi/flota.yaml → listarUnidades` | Agregar el parámetro de consulta `placa` (patrón `^[0-9]{3,4}[A-Z]{3}$`) y el rol `agente_lectura` a la descripción de roles (lo usa `obtener_estado_unidad`, spec 014) | Compatible |
| `contratos/openapi/flota.yaml → Unidad.atributos` | Documentar los atributos por tipo de la regla "Atributos por tipo", en especial `capacidadTanqueLitros` del tracto (lo usa la spec 009) | Compatible (solo descripción y ejemplos) |
| `MantenimientoRequerido.v1` y `flota.yaml → Documento` | Opcional: alinear `INSPECCION` con `INSPECCION_TECNICA`. Hoy Flota traduce y no hace falta cambiar | — |
