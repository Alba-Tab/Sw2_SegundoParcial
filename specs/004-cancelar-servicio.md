# 004 · Cancelar servicio

Estado: **revisado** · Casos de uso: CU-23 Cancelar servicio (nuevo; la propuesta sugería CU-21, que ya es "Cerrar sesión", y reserva CU-22 para "Registrar pago"; se anota para T12.4) · Responsable: Brayan Albaro Garcia Taboada

El cliente, atención comercial o el despachador cancelan un servicio confirmado antes de que el viaje empiece. Es **coreografía**: Viajes cambia el estado y publica `ViajeCancelado`; Finanzas y Flota liberan por su cuenta. No hay nada que coordinar en orden, así que no usa Temporal. Decisiones: D17, D18, D45.

## Actores y roles

| Actor | Rol | Puede cancelar |
|---|---|---|
| Cliente | `cliente` | Solo sus servicios |
| Atención comercial | `comercial` | Cualquier servicio (queda `canal = TELEFONO`) |
| Despachador | `despachador` | Cualquier servicio |
| Finanzas, Flota, Analítica | — | Reaccionan a `ViajeCancelado` |

## Precondiciones

- El viaje está en `CONFIRMADO` y el `Servicio` tiene `confirmacionCompleta = true` (el workflow terminó, spec 003).

## Pasos (camino feliz)

1. El portal (o el Centro de Control) hace `POST /api/v1/servicios/{servicioId}/cancelacion` con `{ "motivo": "…" }` y `Idempotency-Key`.
2. Viajes, en una transacción: verifica estado y permiso, pasa el viaje a `CANCELADO` con el motivo, registra la auditoría y deja `ViajeCancelado` en el Outbox con estos datos: `servicioId`, `viajeId`, `clienteId`, `motivo = CANCELADO_POR_USUARIO` (código), `detalle` = el texto que escribió el usuario, `origen = USUARIO`, `canceladoPor = <sub>`, `estadoAnterior = CONFIRMADO` y, si hay chofer asignado, `choferUsuarioSub` (para el push).
3. Responde `200` con el servicio cancelado.
4. Reacciones (cada una idempotente con Inbox):
   - **Finanzas:** la reserva de crédito del `servicioId` pasa de `ACTIVA` o `PENDIENTE_APROBACION` a `LIBERADA` (`reservado` baja). Con `origen = USUARIO` la cotización sigue `ACEPTADA` (no se reutiliza); con `origen = SAGA` vuelve a `VIGENTE` si sigue en plazo, igual que `Finanzas.liberarCredito`.
   - **Flota:** la reserva de unidad (`PROVISIONAL` o `CONFIRMADA`) pasa a `LIBERADA`; tracto, remolque y chofer vuelven a `DISPONIBLE`.
   - **Analítica:** cierra los hechos del viaje como cancelado.
   - **Viajes (push, D45):** el consumidor interno del Outbox avisa al chofer asignado "Viaje cancelado" (solo con `origen = USUARIO`).

## Reglas de negocio

| Estado del viaje | `confirmacionCompleta` | Respuesta |
|---|---|---|
| `PROGRAMANDO` (incluye la espera de aprobación 2b) | — | `409 CONFIRMACION_EN_CURSO`. El portal muestra "Tu servicio todavía se está confirmando" (o "En aprobación") |
| `CONFIRMADO` | `false` | `409 CONFIRMACION_EN_CURSO` (el paso 5 o 6 de la saga sigue corriendo) |
| `CONFIRMADO` | `true` | Se cancela |
| `EN_RUTA`, `ENTREGA_OBSERVADA` | — | `409 CANCELACION_NO_PERMITIDA`. El portal muestra "Llama a atención comercial" (cancelar en ruta queda fuera de alcance) |
| `ENTREGADO`, `CERRADO`, `ENTREGA_RECHAZADA`, `REQUIERE_INTERVENCION` | — | `409 CONFLICTO_ESTADO` |
| `CANCELADO` | — | Con la misma clave: la respuesta guardada. Con otra clave: `409 CONFLICTO_ESTADO` |

| Regla | Valor |
|---|---|
| Motivo | Obligatorio, 3 a 300 caracteres |
| Liberación idempotente | Si la reserva ya está `LIBERADA` (por ejemplo, porque llegó también un `ViajeCancelado` de la saga), el consumidor no hace nada |
| Mismo evento, dos orígenes | `ViajeCancelado` lo publica también la saga al compensar o al marcar una intervención como resuelta, con `origen = SAGA` (specs 003 y 011). Los consumidores liberan igual en ambos casos (así se liberan solas las reservas que quedaron en `PENDIENTE_APROBACION` o `PROVISIONAL`); el origen solo cambia qué pasa con la cotización y si hay push |

## Estados que cambia

| Entidad | Antes | Después |
|---|---|---|
| `Viaje` | `CONFIRMADO` | `CANCELADO` |
| `ReservaCredito` | `ACTIVA` | `LIBERADA` |
| `ReservaUnidad` | `CONFIRMADA` | `LIBERADA` |
| Tracto, remolque, chofer | `RESERVADA` | `DISPONIBLE` |

## Contratos que toca

- REST: `contratos/openapi/viajes.yaml` → `cancelarServicio`.
- Eventos: `ViajeCancelado.v1` (consumen Finanzas, Flota y Analítica).

## Errores y caminos alternativos

| Caso | Respuesta |
|---|---|
| `cliente` cancela un servicio de otro cliente | `403 SIN_PERMISO` |
| Servicio inexistente | `404 NO_ENCONTRADO` |
| Finanzas o Flota caídos | La cancelación responde `200` igual; el evento espera en la cola de cada uno y se procesa al volver (FC1 en pequeño) |
| Evento que no cumple el esquema | Va a la cola de fallidos del consumidor (FC3) |

## Criterios de aceptación

- **FC4. Dado** un servicio `CONFIRMADO` con `confirmacionCompleta = true` y reserva de 2.800,00, **cuando** el cliente lo cancela, **entonces** responde `200`, el viaje queda `CANCELADO`, el disponible del cliente sube 2.800,00 y la unidad vuelve a `DISPONIBLE`.
- **FS9. Dado** un servicio en `PROGRAMANDO` o con `confirmacionCompleta = false`, **cuando** se cancela, **entonces** `409 CONFIRMACION_EN_CURSO` y nada cambia.
- **Dado** un viaje `EN_RUTA`, **cuando** el cliente cancela, **entonces** `409 CANCELACION_NO_PERMITIDA`.
- **Dado** que Finanzas recibe dos veces el mismo `ViajeCancelado`, **entonces** `reservado` baja una sola vez.
- **Dado** Finanzas detenida, **cuando** se cancela y luego se enciende Finanzas, **entonces** la reserva queda `LIBERADA` sin intervención.

## Cómo se demuestra en la defensa

FC4 del guion: cancelar desde el portal y mostrar el saldo de crédito restaurado en el portal y la unidad disponible en cc-flota. FS9 se muestra con curl justo después de confirmar.
