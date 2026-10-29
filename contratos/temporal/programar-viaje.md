# Contrato Temporal: `ProgramarViaje`

Versión **1** · Spec: [003-programar-viaje.md](../../specs/003-programar-viaje.md) (y 011, 012) · Esquemas y ejemplos: [programar-viaje.schema.json](programar-viaje.schema.json)

Este contrato lo leen tres workers en tres lenguajes. Cualquier cambio va en el mismo PR que los cambios de Viajes (Java), Finanzas (PHP) y Flota (TypeScript), y los ejemplos de cada `$defs` son los *fixtures* que cada SDK deserializa en sus pruebas.

## Conexión

| Dato | Valor |
|---|---|
| Namespace | `transporte` (retención 30 días, D14) |
| Workflow | Tipo `ProgramarViaje`, cola `viajes` |
| `workflowId` | `programar-viaje-<servicioId>` |
| Inicio | `WorkflowIdReusePolicy.REJECT_DUPLICATE`, `WorkflowIdConflictPolicy.FAIL`. `WorkflowExecutionAlreadyStarted` al reintentar el mismo `servicioId` **es éxito** (D43) |
| Colas de actividades | `viajes`, `finanzas`, `flota` |
| Conversor | JSON (el *payload converter* por defecto de cada SDK), camelCase, sin campos `null`: un campo ausente es opcional |
| Seguridad | Local sin TLS; en la nube, mTLS con certificados de cliente firmados por la CA del proyecto |

## Workflow

| Elemento | Nombre | Esquema |
|---|---|---|
| Entrada | — | `EntradaProgramarViaje` |
| Resultado | — | `ResultadoProgramarViaje` |
| Señal | `aprobacionCredito` | `SenalAprobacionCredito` |
| Señal | `resolverIntervencion` | `SenalResolverIntervencion` |
| Consulta | `estado` | `EstadoProgramarViaje` |

`parametrosSaga` (dentro de la entrada) trae `esperaAprobacion` y los límites de las compensaciones. El workflow **no** lee el entorno, la hora del sistema ni números aleatorios: usa `Workflow.currentTimeMillis()`, temporizadores de Temporal y lo que trae la entrada.

## Actividades

Nombres **explícitos**, iguales en los tres SDK:
- Java: interfaces con `@ActivityMethod(name = "Finanzas.validarYReservarCredito")` y `ActivityOptions.setTaskQueue("finanzas")`.
- PHP: `#[ActivityInterface(prefix: "Finanzas.")]` con métodos `validarYReservarCredito`, etc.
- TypeScript: el worker registra `{ 'Flota.reservarUnidad': reservarUnidad, … }`.

| Actividad | Cola | Entrada | Resultado | StartToClose | ScheduleToClose | Reintentos | No reintentables |
|---|---|---|---|---|---|---|---|
| `Viajes.crearViaje` | viajes | `CrearViajeEntrada` | — | 10 s | 5 min | inicial 1 s, ×2, máx. 30 s | `VALIDACION` |
| `Finanzas.validarYReservarCredito` | finanzas | `ValidarYReservarCreditoEntrada` | `ValidarYReservarCreditoResultado` | 15 s | 30 min | igual | `COTIZACION_VENCIDA`, `COTIZACION_AJENA`, `CREDITO_INSUFICIENTE` |
| `Finanzas.registrarDecisionCredito` | finanzas | `RegistrarDecisionCreditoEntrada` | — | 15 s | 30 min | igual | — |
| `Flota.reservarUnidad` | flota | `ReservarUnidadEntrada` | `ReservarUnidadResultado` | 15 s | 30 min | igual | `SIN_UNIDAD_COMPATIBLE` |
| `Viajes.confirmarViaje` | viajes | `ConfirmarViajeEntrada` | — | 10 s | sin límite | sin límite | — |
| `Flota.confirmarReserva` | flota | `ConfirmarReservaEntrada` | — | 15 s | sin límite | sin límite, máx. 1 min | — |
| `Viajes.marcarConfirmacionCompleta` | viajes | `MarcarConfirmacionCompletaEntrada` | — | 10 s | sin límite | sin límite | — |
| `Flota.liberarReserva` | flota | `LiberarReservaEntrada` | — | 15 s | `compensacion.scheduleToClose` | `compensacion.maximoIntentos` | — |
| `Finanzas.liberarCredito` | finanzas | `LiberarCreditoEntrada` | — | 15 s | igual | igual | — |
| `Viajes.cancelarViaje` | viajes | `CancelarViajeEntrada` | — | 15 s | igual | igual | — |
| `Viajes.marcarRequiereIntervencion` | viajes | `MarcarRequiereIntervencionEntrada` | — | 10 s | sin límite | sin límite | — |

"—" en Resultado significa que la actividad no devuelve nada (`void` / `null`). **Toda actividad es idempotente**: la llave es `servicioId` (o `viajeId` / `reservaUnidadId`), así que un reintento no duplica nada.

## Errores

- Un error de negocio es un `ApplicationFailure` con `type` igual al **código de 000 §5** y `nonRetryable = true`. Sus `details` siguen `DetalleFallo`.
- `CLIENTE_NO_REPLICADO` y `DEPENDENCIA_NO_DISPONIBLE` son **reintentables** (`nonRetryable = false`).
- Cualquier otra excepción es técnica y se reintenta según la tabla.
- `REQUIERE_APROBACION` **no** es un error: es `resultado` de `validarYReservarCredito`.
- Errores que lanza el propio workflow (no una actividad): `CREDITO_RECHAZADO` (señal con `aprobado = false`) y `APROBACION_VENCIDA` (vence `esperaAprobacion`).

## Orden y compensaciones

```
1 crearViaje ─► 2 validarYReservarCredito ─► [2b espera aprobacionCredito ─► registrarDecisionCredito]
  ─► 3 reservarUnidad ─► 4 confirmarViaje (pivote) ─► 5 confirmarReserva ─► 6 marcarConfirmacionCompleta
```

- Antes del pivote, un error de negocio (o un error técnico que agota su `ScheduleToClose`) dispara las compensaciones **en orden inverso** de los pasos completados: `Flota.liberarReserva` → `Finanzas.liberarCredito` → `Viajes.cancelarViaje`. El workflow termina con `resultado = CANCELADO` y `motivo` = el código del error.
- Si una compensación se agota: `Viajes.marcarRequiereIntervencion`, etapa `REQUIERE_INTERVENCION`, y espera `resolverIntervencion` sin temporizador:
  - `REINTENTAR_COMPENSACION`: vuelve a correr las compensaciones pendientes (`compensacionesPendientes` de la consulta).
  - `MARCAR_RESUELTO`: corre solo `Viajes.cancelarViaje` con `motivo = RESUELTO_MANUALMENTE` y `detalle = "Resuelto manualmente: <nota>"`, y termina.
- Después del pivote no hay compensación: los pasos 5 y 6 se reintentan sin límite.

## Etapas de la consulta `estado`

| Etapa | Cuándo |
|---|---|
| `INICIANDO` | Antes de terminar el paso 1 |
| `VALIDANDO_CREDITO` | Paso 2 en curso |
| `ESPERANDO_APROBACION` | Esperando `aprobacionCredito` (trae `esperaAprobacionVenceEn`) |
| `RESERVANDO_UNIDAD` | Paso 3 en curso |
| `CONFIRMANDO` | Pasos 4 a 6 |
| `COMPENSANDO` | Corriendo compensaciones |
| `REQUIERE_INTERVENCION` | Esperando `resolverIntervencion` |
| `TERMINADO` | El workflow ya devolvió su resultado |

## Versionado

- Cambios compatibles (agregar un campo opcional): misma versión del contrato.
- Cambios en la lógica del workflow con ejecuciones abiertas: `Workflow.getVersion("<cambio>", DEFAULT_VERSION, 1)` y prueba de *replay* con el historial guardado en `servicios/viajes/src/test/resources/historiales/`.
- Cambios incompatibles en una actividad: actividad nueva con sufijo (`Flota.reservarUnidadV2`) y se retira la anterior cuando no queden ejecuciones que la usen.
