# 011 · Resolver viaje en intervención

Estado: **revisado** · Casos de uso: CU-24 Resolver viaje en intervención (nuevo) · Responsable: Brayan Albaro Garcia Taboada

Cuando una compensación de la saga agota sus reintentos, el sistema no puede dejar el estado a medias en silencio: el viaje pasa a `REQUIERE_INTERVENCION` y una persona decide. Es el camino de la propuesta 5.13. Decisiones: D15, D18.

## Actores y roles

| Actor | Rol | Qué hace |
|---|---|---|
| Despachador | `despachador` | Elige "Reintentar compensación" o "Marcar como resuelto" |
| Gerente | `gerente` | Solo ve los viajes en intervención |
| Workflow `ProgramarViaje` | — | Detecta la compensación agotada y espera la señal |
| Analítica | — | Crea la alerta a partir de `ViajeRequiereIntervencion` (desde F8) |

## Precondiciones

- Una saga está compensando (spec 003) y una de sus compensaciones (`Flota.liberarReserva`, `Finanzas.liberarCredito` o `Viajes.cancelarViaje`) agotó `parametrosSaga.compensacion` (8 intentos o 10 min; en demo, 4 intentos o 2 min).

## Pasos

1. El workflow captura el fallo y ejecuta `Viajes.marcarRequiereIntervencion` (reintento sin límite): el viaje pasa a `REQUIERE_INTERVENCION` y se publica `ViajeRequiereIntervencion` con el paso que falló, el error y los intentos.
2. El workflow guarda qué compensaciones faltan y espera la señal `resolverIntervencion`, **sin temporizador**.
3. El despachador ve el viaje (desde F9 en cc-operaciones; antes, por curl) y elige:
   - **Reintentar compensación**, o
   - **Marcar como resuelto**, con una nota obligatoria.
4. La petición viaja Gateway → Viajes → Temporal: `POST /api/v1/viajes/{viajeId}/intervencion` con `{ "opcion": "REINTENTAR_COMPENSACION" | "MARCAR_RESUELTO", "nota": "…" }` e `Idempotency-Key`. Viajes verifica rol y estado, registra la auditoría y envía la señal con `resueltoPor = <sub>`.
5. Viajes responde `202`: la señal se entregó; el resultado se ve en `GET /api/v1/servicios/{servicioId}`.
6. El workflow actúa:
   - **Reintentar:** vuelve a correr **las compensaciones que faltaban**, en el mismo orden inverso y con los mismos límites. Si terminan, el viaje queda `CANCELADO` (`ViajeCancelado`, `origen = SAGA`). Si alguna vuelve a agotarse, regresa al paso 1 (otra vez `REQUIERE_INTERVENCION`).
   - **Marcar como resuelto:** ejecuta `Viajes.cancelarViaje` con `motivo = "Resuelto manualmente: <nota>"` y `origen = SAGA`, y termina. Las reservas que quedaron sin liberar se liberan **solas** cuando su servicio vuelve, porque Finanzas y Flota consumen ese `ViajeCancelado` de forma idempotente. No hay paso manual.

## Reglas de negocio

| Regla | Valor |
|---|---|
| Quién | Solo `despachador`; otro rol → `403 SIN_PERMISO` |
| Estado | Solo con el viaje en `REQUIERE_INTERVENCION`; si no, `409 CONFLICTO_ESTADO` |
| Nota | Obligatoria para `MARCAR_RESUELTO` (3 a 500 caracteres); opcional para reintentar |
| Una decisión a la vez | Si el workflow ya no está esperando la señal (se envió otra), `409 CONFLICTO_ESTADO` |
| Sin límite de espera | El viaje puede quedar en intervención indefinidamente; el workflow no consume recursos mientras espera |
| Auditoría | Opción, nota, `resueltoPor` y fecha en la auditoría de Viajes |

## Estados que cambia

| Entidad | Cambio |
|---|---|
| `Viaje` | `PROGRAMANDO` → `REQUIERE_INTERVENCION` → `CANCELADO` (o vuelve a `REQUIERE_INTERVENCION` si reintentar falla) |
| `ReservaCredito`, `ReservaUnidad` | Quedan como estaban hasta que su compensación o el consumidor de `ViajeCancelado` las libera |

## Contratos que toca

- REST: `contratos/openapi/viajes.yaml` → `resolverIntervencion`.
- Temporal: actividad `Viajes.marcarRequiereIntervencion`, señal `resolverIntervencion` (`contratos/temporal/programar-viaje.md`).
- Eventos: `ViajeRequiereIntervencion.v1`, `ViajeCancelado.v1`.
- GraphQL (F9): mutación `resolverIntervencion(viajeId, opcion, nota)`.

## Errores y caminos alternativos

| Caso | Respuesta |
|---|---|
| Temporal no responde al enviar la señal | `503 DEPENDENCIA_NO_DISPONIBLE`; un reenvío con la misma clave vuelve a intentar |
| Viaje inexistente | `404 NO_ENCONTRADO` |
| Reenvío con la misma clave | La respuesta guardada; la señal no se envía dos veces |

## Criterios de aceptación

- **FS8. Dado** el script `saga-compensacion-agotada.sh` (worker de Flota apagado; confirmar Cochabamba con 20 t de `INSUMOS_LIQUIDOS`; cortar la base de Finanzas con Toxiproxy; encender el worker de Flota), **cuando** `Flota.reservarUnidad` falla con `SIN_UNIDAD_COMPATIBLE` y `Finanzas.liberarCredito` agota sus 4 intentos de demo, **entonces** el viaje queda `REQUIERE_INTERVENCION` y se publica `ViajeRequiereIntervencion` (visible en la cola `analitica.eventos`).
- **Dado** FS8 y la base de Finanzas restaurada, **cuando** el despachador elige "Reintentar compensación", **entonces** la reserva de crédito queda `LIBERADA`, el viaje `CANCELADO` y el workflow termina.
- **Dado** FS8 sin restaurar Finanzas, **cuando** el despachador elige "Marcar como resuelto" con nota, **entonces** el viaje queda `CANCELADO` con la nota en el motivo; **y cuando** Finanzas vuelve, **entonces** la reserva queda `LIBERADA` sin otra acción.
- **Dado** un viaje `CONFIRMADO`, **cuando** se envía una intervención, **entonces** `409 CONFLICTO_ESTADO`.
- **Dado** un usuario `gerente`, **cuando** envía una intervención, **entonces** `403 SIN_PERMISO`.

## Cómo se demuestra en la defensa

FS8 del guion. En H4 se ve en la Temporal UI y en la cola de RabbitMQ; desde H8 aparece la alerta y desde H9 el despachador resuelve en cc-operaciones.
