# Eventos v1

Catálogo cerrado de eventos (D19). Reglas en `specs/000-convenciones.md` §6: sobre común ([sobre.schema.json](sobre.schema.json)), Outbox al publicar, Inbox al consumir, `versionAgregado` en las copias.

- Un esquema por evento: `<contexto>/<Evento>.v1.schema.json`, con un ejemplo completo que sirve de *fixture*.
- [asyncapi.yaml](asyncapi.yaml): canales (claves de enrutamiento), quién publica y quién consume.
- Validación: `npm run validar` en `contratos/`.

## Catálogo

| Evento | Publica | Clave de enrutamiento | Consumen |
|---|---|---|---|
| [ClienteActualizado](viajes/ClienteActualizado.v1.schema.json) | viajes | `viajes.cliente-actualizado.v1` | finanzas, analitica |
| [RutaActualizada](viajes/RutaActualizada.v1.schema.json) | viajes | `viajes.ruta-actualizada.v1` | finanzas, analitica |
| [ChoferActualizado](flota/ChoferActualizado.v1.schema.json) | flota | `flota.chofer-actualizado.v1` | analitica |
| [ViajeConfirmado](viajes/ViajeConfirmado.v1.schema.json) | viajes | `viajes.viaje-confirmado.v1` | analitica |
| [ViajeCancelado](viajes/ViajeCancelado.v1.schema.json) | viajes | `viajes.viaje-cancelado.v1` | finanzas, flota, analitica |
| [ViajeIniciado](viajes/ViajeIniciado.v1.schema.json) | viajes | `viajes.viaje-iniciado.v1` | flota, analitica |
| [HitoRegistrado](viajes/HitoRegistrado.v1.schema.json) | viajes | `viajes.hito-registrado.v1` | analitica |
| [PosicionActualizada](viajes/PosicionActualizada.v1.schema.json) | viajes | `viajes.posicion-actualizada.v1` | analitica |
| [EventoConduccionRegistrado](viajes/EventoConduccionRegistrado.v1.schema.json) | viajes | `viajes.evento-conduccion-registrado.v1` | analitica |
| [EntregaConfirmada](viajes/EntregaConfirmada.v1.schema.json) | viajes | `viajes.entrega-confirmada.v1` | finanzas, flota, analitica |
| [EntregaObservada](viajes/EntregaObservada.v1.schema.json) | viajes | `viajes.entrega-observada.v1` | analitica |
| [EntregaRechazada](viajes/EntregaRechazada.v1.schema.json) | viajes | `viajes.entrega-rechazada.v1` | finanzas, flota, analitica |
| [ViajeRequiereIntervencion](viajes/ViajeRequiereIntervencion.v1.schema.json) | viajes | `viajes.viaje-requiere-intervencion.v1` | analitica |
| [FacturaEmitida](finanzas/FacturaEmitida.v1.schema.json) | finanzas | `finanzas.factura-emitida.v1` | viajes, n8n, analitica |
| [PagoRegistrado](finanzas/PagoRegistrado.v1.schema.json) | finanzas | `finanzas.pago-registrado.v1` | analitica |
| [CargaCombustibleRegistrada](flota/CargaCombustibleRegistrada.v1.schema.json) | flota | `flota.carga-combustible-registrada.v1` | analitica |
| [CaidaCombustibleDetectada](flota/CaidaCombustibleDetectada.v1.schema.json) | flota | `flota.caida-combustible-detectada.v1` | analitica |
| [MantenimientoRequerido](flota/MantenimientoRequerido.v1.schema.json) | flota | `flota.mantenimiento-requerido.v1` | analitica |
| [AvisoClienteAprobado](analitica/AvisoClienteAprobado.v1.schema.json) | analitica | `analitica.aviso-cliente-aprobado.v1` | n8n |

## Colas (RabbitMQ)

Exchange `transporte.events` (topic, durable). Cada cola es **quorum**, con `x-delivery-limit = 5` y su cola de fallidos `<cola>.dlq` por el exchange `transporte.dlx`.

| Cola | Bindings |
|---|---|
| `viajes.eventos` | `finanzas.factura-emitida.v1` |
| `finanzas.eventos` | `viajes.cliente-actualizado.v1`, `viajes.ruta-actualizada.v1`, `viajes.viaje-cancelado.v1`, `viajes.entrega-confirmada.v1`, `viajes.entrega-rechazada.v1` |
| `flota.eventos` | `viajes.viaje-cancelado.v1`, `viajes.viaje-iniciado.v1`, `viajes.entrega-confirmada.v1`, `viajes.entrega-rechazada.v1` |
| `analitica.eventos` | `viajes.cliente-actualizado.v1`, `viajes.ruta-actualizada.v1`, `flota.chofer-actualizado.v1`, `viajes.viaje-confirmado.v1`, `viajes.viaje-cancelado.v1`, `viajes.viaje-iniciado.v1`, `viajes.hito-registrado.v1`, `viajes.posicion-actualizada.v1`, `viajes.evento-conduccion-registrado.v1`, `viajes.entrega-confirmada.v1`, `viajes.entrega-observada.v1`, `viajes.entrega-rechazada.v1`, `viajes.viaje-requiere-intervencion.v1`, `finanzas.factura-emitida.v1`, `finanzas.pago-registrado.v1`, `flota.carga-combustible-registrada.v1`, `flota.caida-combustible-detectada.v1`, `flota.mantenimiento-requerido.v1` |
| `n8n.eventos` | `finanzas.factura-emitida.v1`, `analitica.aviso-cliente-aprobado.v1` |
| `flota.sensor` | Exchange `amq.topic`, clave `camion.*.combustible` (mensajes MQTT del simulador, sin sobre) |

## Push al chofer (D45)

No es un evento del broker: un consumidor interno del Outbox de Viajes envía la notificación después del commit, idempotente por `id` del evento, para `ViajeConfirmado`, `ViajeCancelado` con `origen = USUARIO` y la aprobación o rechazo de una entrega observada.
