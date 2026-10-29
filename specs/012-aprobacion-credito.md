# 012 · Aprobar crédito por mora o monto alto

Estado: **revisado** · Casos de uso: CU-25 Aprobar crédito por mora (nuevo) · Responsable: Brayan Albaro Garcia Taboada

Es el paso 2b de la saga (spec 003): cuando el cliente tiene mora o el monto es alto, la reserva de crédito queda pendiente y el workflow espera que administración decida. Es la contramedida "por valor" de la propuesta 5.3. Decisiones: D04, D05, D16.

## Actores y roles

| Actor | Rol | Qué hace |
|---|---|---|
| Administración | `administracion` | Ve las solicitudes pendientes y aprueba o rechaza |
| Gerente | `gerente` | Solo ve las solicitudes |
| Cliente | `cliente` | Ve su servicio "En aprobación" |
| Finanzas | — | Crea la solicitud y registra la decisión |
| Workflow `ProgramarViaje` | — | Espera la señal con un temporizador |

## Precondiciones

- Saga en curso; el paso 2 encontró que el cliente tiene disponible suficiente **y** cumple al menos una condición:
  - **Mora:** al menos una factura con saldo > 0 vencida hace más de 7 días (D04).
  - **Monto alto:** la cotización supera 15.000,00 BOB (D05).
- Si el disponible no alcanza, no hay 2b: el paso 2 falla con `CREDITO_INSUFICIENTE` (spec 003).

## Pasos

1. `Finanzas.validarYReservarCredito`, en una transacción: cotización `ACEPTADA`, `ReservaCredito` en `PENDIENTE_APROBACION` (cuenta en `reservado`), y una `SolicitudAprobacion` `PENDIENTE` con `servicioId`, `clienteId`, monto, `motivos` (`MORA`, `MONTO_ALTO` o ambos) y `venceEn = ahora + esperaAprobacion`. Devuelve `resultado = REQUIERE_APROBACION`.
2. El workflow pasa a la etapa `ESPERANDO_APROBACION` y espera la señal `aprobacionCredito` con un temporizador de `parametrosSaga.esperaAprobacion` (`PT24H`; demo `PT3M`).
3. Administración ve las solicitudes en `GET /api/v1/solicitudes-aprobacion?estado=PENDIENTE` (Finanzas), con el detalle de facturas vencidas del cliente.
4. Decide: `POST /api/v1/servicios/{servicioId}/aprobacion-credito` en **Viajes** con `{ "aprobado": true|false, "motivo": "…" }` e `Idempotency-Key`. Viajes verifica rol y que el workflow esté en `ESPERANDO_APROBACION` (consulta `estado`), y envía la señal con `aprobadoPor = <sub>`. Responde `202`.
5. El workflow ejecuta `Finanzas.registrarDecisionCredito` con `{servicioId, aprobado, aprobadoPor, motivo}`:
   - **Aprobado:** reserva `PENDIENTE_APROBACION` → `ACTIVA`; solicitud `APROBADA`. La saga sigue en el paso 3.
   - **Rechazado:** solicitud `RECHAZADA`. El workflow lanza el error de negocio `CREDITO_RECHAZADO` y compensa: `Finanzas.liberarCredito` (reserva `LIBERADA`, cotización a `VIGENTE` si sigue en plazo) y `Viajes.cancelarViaje`.
6. **Si vence el temporizador** sin señal: `Finanzas.registrarDecisionCredito` con `aprobado = false`, `aprobadoPor = "sistema"`, `motivo = "Plazo de aprobación vencido"`; solicitud `VENCIDA`; error `APROBACION_VENCIDA` y la misma compensación.

## Reglas de negocio

| Regla | Valor |
|---|---|
| Quién decide | Solo `administracion`; `comercial` no puede (propuesta 7.2: "no puede aprobar crédito ni saltarse la saga") |
| Una decisión | Si la solicitud ya no está `PENDIENTE` o el workflow ya no espera, `409 CONFLICTO_ESTADO` |
| Motivo | Obligatorio al rechazar (3 a 300 caracteres); opcional al aprobar |
| Auditoría | Decisión, `aprobadoPor`, motivo y fecha en la `SolicitudAprobacion` (auditoría de Finanzas) y la petición en la auditoría de Viajes. No hay eventos `CreditoAprobado` ni `CreditoRechazado` (D19) |
| Cancelar mientras espera | No se puede: el viaje está en `PROGRAMANDO` (`409 CONFIRMACION_EN_CURSO`, spec 004) |
| Lo que ve el cliente | `GET /servicios/{id}` con `etapa = ESPERANDO_APROBACION`; el portal muestra "En aprobación" |

## Estados que cambia

| Entidad | Estados |
|---|---|
| `SolicitudAprobacion` (Finanzas) | — → `PENDIENTE` → `APROBADA`, `RECHAZADA` o `VENCIDA` |
| `ReservaCredito` | — → `PENDIENTE_APROBACION` → `ACTIVA` o `LIBERADA` |
| `Cotizacion` | `ACEPTADA` → `VIGENTE` (si se rechaza o vence y sigue en plazo) |
| `Viaje` | `PROGRAMANDO` → `CANCELADO` si se rechaza o vence |

## Contratos que toca

- REST: `contratos/openapi/viajes.yaml` → `decidirAprobacionCredito`; `contratos/openapi/finanzas.yaml` → `listarSolicitudesAprobacion`, `obtenerSolicitudAprobacion`.
- Temporal: señal `aprobacionCredito`, actividad `Finanzas.registrarDecisionCredito`, consulta `estado`.
- GraphQL (F9): `aprobarCredito(servicioId, aprobado, motivo)`.

## Errores y caminos alternativos

| Caso | Respuesta |
|---|---|
| Otro rol | `403 SIN_PERMISO` |
| Servicio que no está esperando aprobación | `409 CONFLICTO_ESTADO` |
| Rechazo sin motivo | `400 VALIDACION` |
| Temporal no responde | `503 DEPENDENCIA_NO_DISPONIBLE` |
| Finanzas caída al registrar la decisión | La actividad se reintenta dentro de su `ScheduleToClose` de 30 min; después, el paso falla y se compensa |

## Criterios de aceptación

- **Dado** "Agro Moroso" y La Paz con 20 t (7.600), **cuando** confirma, **entonces** hay una `SolicitudAprobacion` `PENDIENTE` con motivo `MORA`, la reserva está `PENDIENTE_APROBACION` y el disponible bajó 7.600.
- **Dado** esa solicitud, **cuando** administración aprueba, **entonces** la reserva queda `ACTIVA`, la solicitud `APROBADA` con su `aprobadoPor`, y el servicio llega a `CONFIRMADO`.
- **Dado** esa solicitud, **cuando** administración rechaza con motivo, **entonces** el servicio queda `CANCELADO` con `CREDITO_RECHAZADO` y el disponible vuelve a 25.000.
- **Dado** `esperaAprobacion = PT3M` y ninguna decisión, **cuando** pasan 3 minutos, **entonces** la solicitud queda `VENCIDA` y el servicio `CANCELADO` con `APROBACION_VENCIDA`.
- **Dado** un cliente sin mora y Arica con 28 t (18.200), **cuando** confirma, **entonces** la solicitud tiene motivo `MONTO_ALTO`.
- **Dado** una solicitud ya decidida, **cuando** se envía otra decisión, **entonces** `409 CONFLICTO_ESTADO`.
- **Dado** un usuario `comercial`, **cuando** intenta decidir, **entonces** `403 SIN_PERMISO`.

## Cómo se demuestra en la defensa

FS3 del guion: en H4 por curl y la Temporal UI (se ve el workflow esperando la señal); desde H9, administración aprueba o rechaza en cc-finanzas mientras el portal del cliente muestra "En aprobación".
