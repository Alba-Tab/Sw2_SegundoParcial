# 003 · Programar viaje (saga con Temporal)

Estado: **revisado** · Casos de uso: CU-02 Confirmar servicio · Responsable: Brayan Albaro Garcia Taboada

El cliente confirma una cotización. Viajes inicia el workflow `ProgramarViaje`, que coordina tres servicios en tres lenguajes: crea el viaje, valida la cotización y reserva crédito en Finanzas, reserva unidad y chofer en Flota, y confirma. Si algo falla, compensa en orden inverso. Es la transacción distribuida del requisito 2. Decisiones: D02, D03, D11, D14–D18, D43. Contrato detallado: `contratos/temporal/programar-viaje.md`.

## Actores y roles

| Actor | Rol | Qué hace |
|---|---|---|
| Cliente | `cliente` | Confirma su cotización |
| Atención comercial | `comercial` | Confirma a nombre de un cliente |
| Administración | `administracion` | Aprueba o rechaza crédito en el paso 2b (spec 012) |
| Despachador | `despachador` | Resuelve un viaje en intervención (spec 011) |
| Worker de Viajes (Java) | — | Ejecuta el workflow y las actividades de Viajes (cola `viajes`) |
| Worker de Finanzas (PHP) | — | Actividades de Finanzas (cola `finanzas`) |
| Worker de Flota (TypeScript) | — | Actividades de Flota (cola `flota`) |

## Precondiciones

- La cotización existe, está `VIGENTE` y es del cliente (spec 002).
- El cliente tiene línea de crédito en Finanzas (D01) o está por recibirla (D02).
- Los tres workers están conectados a Temporal (namespace `transporte`).

## Modelo

- **`Servicio` y `Viaje` son 1:1** (D03). Viajes guarda los dos: el `Servicio` es el pedido del cliente (cotización, canal, quién lo creó, `workflowId`, `confirmacionCompleta`); el `Viaje` es la operación (estado, ruta, carga, unidad, chofer, hitos, entrega).
- Viajes genera `servicioId` y `viajeId` (UUIDv7) **antes** de iniciar el workflow. `workflowId = programar-viaje-<servicioId>`.
- Viajes no consulta a Finanzas por REST: los datos de la cotización (ruta, carga, toneladas, fecha, monto) llegan como resultado del paso 2 y se guardan en el paso 4.

## Pasos (camino feliz)

**Inicio (síncrono, en la API de Viajes)**

1. El portal hace `POST /api/v1/servicios` con `{ "cotizacionId": "…", "clienteId": "…" }` y `Idempotency-Key` (una clave **nueva por intento**: si un intento terminó compensado, el siguiente usa otra). `clienteId` es **obligatorio con rol `comercial`** (se guarda `canal = TELEFONO`) y **se ignora con rol `cliente`** (sale del token, `canal = PORTAL`). Otro rol: `403 SIN_PERMISO`.
2. Viajes, en una transacción: registra la clave en `operacion_idempotente` (`EN_PROCESO`), crea el `Servicio` con `servicioId`, `viajeId`, `clienteId`, `cotizacionId`, `canal`, `creadoPor` y `workflowId`.
3. Viajes inicia el workflow con `WorkflowIdReusePolicy.REJECT_DUPLICATE`, conflicto `FAIL`, y la entrada `{servicioId, viajeId, clienteId, cotizacionId, canal, creadoPor, parametrosSaga}`. `parametrosSaga` lo arma la API desde su configuración (la del workflow no lee el entorno).
4. Marca la clave `COMPLETADA` y responde **`202`** con `{servicioId, viajeId, estado: "PROGRAMANDO"}` y `Location: /api/v1/servicios/{servicioId}`.
5. El portal consulta `GET /api/v1/servicios/{servicioId}` cada 2 s hasta que `estado` deja de ser `PROGRAMANDO`. Mientras tanto muestra la `etapa`.

**Workflow**

| Paso | Actividad (cola) | Qué hace | Compensación |
|---|---|---|---|
| 1 | `Viajes.crearViaje` (viajes) | Crea el `Viaje` en `PROGRAMANDO` con `cotizacionId` y `clienteId` | `Viajes.cancelarViaje`: `CANCELADO` con motivo y `ViajeCancelado` (`origen = SAGA`) |
| 2 | `Finanzas.validarYReservarCredito` (finanzas) | Recibe además `esperaAprobacion` de `parametrosSaga`. En una transacción: cotización `VIGENTE` y del cliente → `ACEPTADA`; disponible ≥ monto; reserva por `servicioId` (`ACTIVA`, o `PENDIENTE_APROBACION` si hay mora o monto alto). Devuelve los datos de la cotización y `resultado` (`RESERVADO` o `REQUIERE_APROBACION`) | `Finanzas.liberarCredito`: reserva `LIBERADA`; la cotización vuelve a `VIGENTE` si sigue en plazo |
| 2b | Espera de la señal `aprobacionCredito` (solo si `REQUIERE_APROBACION`) | Temporizador `parametrosSaga.esperaAprobacion`. Con la señal o al vencer, `Finanzas.registrarDecisionCredito`. Detalle en la spec 012 | Si se rechaza o vence: error de negocio y se compensa |
| 3 | `Flota.reservarUnidad` (flota) | Tracto + remolque compatible + chofer habilitado (D11), en una operación atómica. Devuelve `reservaUnidadId`, `placa`, `tractoId`, `remolqueId`, `choferId`, `choferNombre`, `choferUsuarioSub` | `Flota.liberarReserva` |
| 4 | `Viajes.confirmarViaje` (viajes) | **Pivote.** `CONFIRMADO`; guarda ruta, carga, toneladas, fecha, monto, placa y chofer; publica `ViajeConfirmado` por Outbox. El consumidor interno del Outbox avisa por push al chofer asignado "Viaje asignado" (D45) | — (punto de no retorno) |
| 5 | `Flota.confirmarReserva` (flota) | La reserva pasa de provisional a confirmada. Idempotente e incondicional sobre su propia reserva | Reintento sin límite |
| 6 | `Viajes.marcarConfirmacionCompleta` (viajes) | `confirmacionCompleta = true` en el `Servicio`. Desde aquí se puede cancelar (spec 004) | Reintento sin límite |

El workflow termina con `{resultado: "CONFIRMADO", servicioId, viajeId}`.

## Reglas de negocio

| Regla | Valor |
|---|---|
| Orden de validación del paso 2 | (1) cotización existe, es del cliente y está `VIGENTE` (si no: `COTIZACION_AJENA` o `COTIZACION_VENCIDA`); (2) `disponible = limite − reservado − utilizado ≥ monto` (si no: `CREDITO_INSUFICIENTE`); (3) mora o monto alto → `REQUIERE_APROBACION` |
| Mora | El cliente tiene al menos una factura con saldo > 0 vencida hace más de 7 días (D04) |
| Monto alto | Más de 15.000,00 BOB (D05) |
| Cliente sin copia en Finanzas | `CLIENTE_NO_REPLICADO`, **reintentable** dentro del `ScheduleToClose` de 30 min (D02) |
| Línea de crédito | Las operaciones son sumas y restas atómicas con número de versión; `PENDIENTE_APROBACION` y `ACTIVA` cuentan en `reservado` |
| Elección de unidad (paso 3) | `GRANOS`→`FURGON`; `INSUMOS`→`FURGON` o `PLATAFORMA`; `INSUMOS_LIQUIDOS`→`CISTERNA`; `CONTENEDOR`→`PLATAFORMA`. Capacidad del remolque ≥ toneladas. Tracto y remolque `DISPONIBLE` con SOAT e inspección vigentes. Chofer activo con licencia categoría C vigente. **Entre las compatibles, la de mayor kilometraje desde su último mantenimiento**; desempate por placa |
| Una reserva activa | Una unidad (tracto o remolque) y un chofer tienen como máximo una reserva activa (D11). La reserva se hace con una actualización condicional (`estado = DISPONIBLE` → `RESERVADA`), así que dos sagas no pueden tomar la misma unidad |
| Relectura | En el paso 3, Flota relee el estado de la unidad dentro de la misma operación atómica (contramedida "releer el valor") |
| Bloqueo semántico | Un viaje en `PROGRAMANDO` o una unidad `RESERVADA` no se editan ni se reasignan; una cancelación en `PROGRAMANDO` da `409 CONFIRMACION_EN_CURSO` |
| Determinismo | El workflow no lee el entorno ni la hora del sistema; todo lo configurable llega en `parametrosSaga` |
| Versionado | Todo cambio del workflow con ejecuciones abiertas usa `Workflow.getVersion`; hay una prueba de *replay* con un historial guardado |

**`parametrosSaga`** (valores normales / demo):

| Parámetro | Normal | Demo |
|---|---|---|
| `esperaAprobacion` | `PT24H` | `PT3M` |
| `compensacion.scheduleToClose` | `PT10M` | `PT2M` |
| `compensacion.maximoIntentos` | 8 | 4 |

**Timeouts de las actividades (D15)**

| Actividad | StartToClose | ScheduleToClose | Reintentos | No reintentables |
|---|---|---|---|---|
| `Viajes.crearViaje` | 10 s | 5 min | inicial 1 s, ×2, máximo 30 s | `VALIDACION` |
| `Finanzas.validarYReservarCredito` | 15 s | 30 min | igual | `COTIZACION_VENCIDA`, `COTIZACION_AJENA`, `CREDITO_INSUFICIENTE` |
| `Finanzas.registrarDecisionCredito` | 15 s | 30 min | igual | — |
| `Flota.reservarUnidad` | 15 s | 30 min | igual | `SIN_UNIDAD_COMPATIBLE` |
| `Viajes.confirmarViaje` | 10 s | sin límite | sin límite | — |
| `Flota.confirmarReserva` | 15 s | sin límite | sin límite, máximo 1 min entre intentos | — |
| `Viajes.marcarConfirmacionCompleta` | 10 s | sin límite | sin límite | — |
| Compensaciones (`Flota.liberarReserva`, `Finanzas.liberarCredito`, `Viajes.cancelarViaje`) | 15 s | `compensacion.scheduleToClose` | `compensacion.maximoIntentos` | — |
| `Viajes.marcarRequiereIntervencion` (spec 011) | 10 s | sin límite | sin límite | — |

Si una compensación se agota, el viaje pasa a `REQUIERE_INTERVENCION` (spec 011).

## Estados que cambia

### Máquina de estados del `Viaje` (todas las specs)

| Desde | Hacia | Cuándo | Spec |
|---|---|---|---|
| — | `PROGRAMANDO` | Paso 1 | 003 |
| `PROGRAMANDO` | `CONFIRMADO` | Paso 4 (pivote) | 003 |
| `PROGRAMANDO` | `CANCELADO` | Compensación del paso 1 | 003 |
| `PROGRAMANDO` | `REQUIERE_INTERVENCION` | Una compensación se agotó | 011 |
| `REQUIERE_INTERVENCION` | `CANCELADO` | "Reintentar compensación" con éxito, o "Marcar como resuelto" | 011 |
| `CONFIRMADO` | `CANCELADO` | Cancelación con `confirmacionCompleta = true` | 004 |
| `CONFIRMADO` | `EN_RUTA` | El chofer registra el inicio | 005 |
| `EN_RUTA` | `ENTREGADO` | Entrega dentro de la geocerca y con firma | 006 |
| `EN_RUTA` | `ENTREGA_OBSERVADA` | Entrega fuera de la geocerca o sin firma | 007 |
| `EN_RUTA` | `ENTREGA_RECHAZADA` | El receptor rechaza la carga | 007 |
| `ENTREGA_OBSERVADA` | `ENTREGADO` | El despachador aprueba la evidencia | 007 |
| `ENTREGA_OBSERVADA` | `ENTREGA_RECHAZADA` | El despachador la rechaza | 007 |
| `ENTREGADO` | `CERRADO` | Llega `FacturaEmitida` | 006 |

**Estados finales:** `CERRADO`, `CANCELADO` y `ENTREGA_RECHAZADA` (qué pasa con la carga rechazada queda fuera de alcance). Cualquier otra transición responde `409 CONFLICTO_ESTADO`.

### Otras entidades

| Entidad | Cambios |
|---|---|
| `Servicio` (Viajes) | `confirmacionCompleta`: `false` → `true` en el paso 6 |
| `Cotizacion` (Finanzas) | `VIGENTE` → `ACEPTADA` (paso 2) → `VIGENTE` si se compensa en plazo |
| `ReservaCredito` (Finanzas) | — → `ACTIVA` o `PENDIENTE_APROBACION` → `ACTIVA` (aprobada) → `CONSUMIDA` (al facturar, spec 006) o `LIBERADA` |
| `ReservaUnidad` (Flota) | — → `PROVISIONAL` (paso 3) → `CONFIRMADA` (paso 5) o `LIBERADA` |
| Tracto y remolque (Flota) | `DISPONIBLE` → `RESERVADA` (paso 3) → `DISPONIBLE` si se libera |
| Chofer (Flota) | `disponible`: `true` → `false` (paso 3) → `true` si se libera |

### Etapa visible en `GET /servicios/{id}`

Mientras el viaje está en `PROGRAMANDO`, la API consulta el workflow (consulta `estado`) y devuelve `etapa`: `INICIANDO`, `VALIDANDO_CREDITO`, `ESPERANDO_APROBACION`, `RESERVANDO_UNIDAD`, `CONFIRMANDO` o `COMPENSANDO`. Si Temporal no responde, `etapa = DESCONOCIDA` y el resto de la respuesta sale de la base.

## Contratos que toca

- REST: `contratos/openapi/viajes.yaml` → `crearServicio`, `obtenerServicio`, `listarServicios`.
- Temporal: `contratos/temporal/programar-viaje.md` y `programar-viaje.schema.json` (workflow, 11 actividades, 2 señales, 1 consulta).
- Eventos: `ViajeConfirmado.v1`, `ViajeCancelado.v1`, `ViajeRequiereIntervencion.v1`.

## Errores y caminos alternativos

| Caso | Qué pasa | Resultado visible |
|---|---|---|
| Doble clic (misma clave y mismo cuerpo) | Si la primera está `COMPLETADA`: la respuesta guardada. Si está `EN_PROCESO`: Viajes vuelve a llamar `start` con el `workflowId` guardado; `AlreadyStarted` cuenta como éxito (D43) | Dos `202` con el mismo `servicioId`; un solo workflow |
| Misma clave, otro cuerpo | — | `422 IDEMPOTENCIA_CUERPO_DISTINTO` |
| Cotización vencida | Error de negocio en el paso 2; se compensa el paso 1 | `CANCELADO`, motivo `COTIZACION_VENCIDA` |
| Cotización de otro cliente | Igual | `CANCELADO`, motivo `COTIZACION_AJENA` |
| Crédito insuficiente | Igual | `CANCELADO`, motivo `CREDITO_INSUFICIENTE` |
| Mora o monto alto | Espera en 2b (spec 012) | `etapa = ESPERANDO_APROBACION`; el portal muestra "En aprobación" |
| Aprobación rechazada o vencida | Se compensan los pasos 2 y 1 | `CANCELADO`, motivo `CREDITO_RECHAZADO` o `APROBACION_VENCIDA` |
| Sin unidad compatible | Se compensan 2 y luego 1 (orden inverso) | `CANCELADO`, motivo `SIN_UNIDAD_COMPATIBLE` |
| Worker apagado | La actividad queda programada; si vuelve dentro de su `ScheduleToClose`, sigue; si no, el paso falla y se compensa | Etapa detenida y luego sigue |
| Worker de Viajes reiniciado a la mitad | El workflow se reconstruye desde el historial | Sigue sin duplicar el viaje |
| Compensación agotada | `REQUIERE_INTERVENCION` | Spec 011 |
| Temporal caído al iniciar | La clave queda `EN_PROCESO`; Viajes responde `503 DEPENDENCIA_NO_DISPONIBLE`; un reenvío con la misma clave reintenta el `start` | — |

## Criterios de aceptación

- **Dado** un cliente con crédito y una cotización vigente del Aula (2.800,00 BOB), **cuando** confirma, **entonces** recibe `202`, y en menos de 10 s el servicio queda `CONFIRMADO` con placa y chofer, `confirmacionCompleta = true`, reserva de crédito `ACTIVA` por 2.800,00 y la unidad `RESERVADA`.
- **FS1. Dado** `COTIZACION_VIGENCIA=PT2M` y una cotización de hace más de 2 minutos, **cuando** se confirma, **entonces** el viaje queda `CANCELADO` con motivo `COTIZACION_VENCIDA`, sin reserva de crédito ni de unidad.
- **FS2. Dado** "Ferretería Sin Crédito" (límite 5.000) y La Paz con 20 t de granos (7.600), **cuando** confirma, **entonces** `CANCELADO` con `CREDITO_INSUFICIENTE`.
- **FS3. Dado** "Agro Moroso" (límite 30.000, factura de 5.000 vencida hace 20 días) y La Paz con 20 t (7.600), **cuando** confirma, **entonces** el servicio queda con `estado = PROGRAMANDO` y `etapa = ESPERANDO_APROBACION`, y aparece una `SolicitudAprobacion` `PENDIENTE`; **y cuando** administración aprueba, **entonces** sigue hasta `CONFIRMADO`; **y si** rechaza, **entonces** `CANCELADO` con `CREDITO_RECHAZADO` y el disponible vuelve a 25.000. Con Arica y 28 t (18.200) pasa lo mismo por monto alto.
- **FS4. Dado** que la única cisterna está en `MANTENIMIENTO_PENDIENTE` y Cochabamba con 20 t de `INSUMOS_LIQUIDOS` (6.250), **cuando** confirma, **entonces** el historial de Temporal muestra `Finanzas.liberarCredito` antes que `Viajes.cancelarViaje`, y el viaje queda `CANCELADO` con `SIN_UNIDAD_COMPATIBLE`.
- **FS5. Dado** el worker de Flota detenido, **cuando** se confirma y se enciende el worker 1 minuto después, **entonces** el servicio llega a `CONFIRMADO` sin intervención.
- **FS6. Dado** FS5 en curso, **cuando** se detiene el contenedor de Viajes, se enciende Flota y luego Viajes, **entonces** el workflow sigue y existe un solo viaje para ese `servicioId`.
- **FS7. Dado** dos `POST /servicios` simultáneos con la misma clave y cuerpo, **entonces** los dos reciben `202` con el mismo `servicioId` y hay un solo workflow.
- **FS9. Dado** un servicio en `PROGRAMANDO`, **cuando** se intenta cancelar, **entonces** `409 CONFIRMACION_EN_CURSO` (spec 004).
- **Dado** un usuario `comercial`, **cuando** confirma sin `clienteId`, **entonces** `403 SIN_PERMISO`; **y con** `clienteId`, **entonces** el servicio queda con `canal = TELEFONO` y `creadoPor` del comercial.
- **Replay. Dado** un historial guardado del camino feliz, **cuando** corre la prueba de *replay* con el código actual, **entonces** no hay error de no determinismo.

## Cómo se demuestra en la defensa

Pasos 3 del escenario y FS1–FS8 del guion (`specs/guion-fallos.md`), cada uno con su script `plataforma/scripts/demo/saga-*.sh`, mostrando en paralelo el portal (o la terminal) y la Temporal UI con el historial: actividades en verde, la que falla, y las compensaciones en orden inverso.
