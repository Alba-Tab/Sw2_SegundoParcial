# 006 · Entrega confirmada, factura y cierre

Estado: **revisado** · Casos de uso: CU-07 Confirmar entrega (camino feliz), CU-12 Generar cuenta por cobrar (factura) · Responsable: Brayan Albaro Garcia Taboada

En destino el chofer registra foto, firma y posición. Si está dentro de la geocerca y con firma, Viajes deja el viaje `ENTREGADO` y publica `EntregaConfirmada`. Es **coreografía** (requisito 17): Finanzas factura y consume la reserva, Flota libera la unidad y suma kilómetros, Analítica cierra los hechos, Viajes cierra el viaje al recibir `FacturaEmitida` y n8n avisa al cliente. CU-07 termina en `EntregaConfirmada` (hallazgo 12 de la propuesta 16); lo demás es CU-12. Las entregas observadas y los rechazos están en la spec 007. Decisiones: D04, D06, D07, D40, D46, D48. Propuesta 5.6.

## Actores y roles

| Actor | Rol | Qué hace |
|---|---|---|
| Chofer | `chofer` | Toma foto, pide la firma al receptor y registra la entrega |
| Receptor | — (sin app) | Firma en el celular del chofer |
| Finanzas (consumidor) | — | Emite la factura, consume la reserva, publica `FacturaEmitida` |
| Flota (consumidor) | — | Libera la unidad, suma `kmRecorridos` y revisa mantenimiento (spec 010) |
| Viajes (consumidor) | — | `ENTREGADO` → `CERRADO` con `FacturaEmitida` |
| n8n | — | Correo al cliente; sin reglas de negocio |
| Cliente | `cliente` | Ve el POD y sus facturas en el portal (MUI + TanStack Table, D46 y D48) |
| Administración, gerente | `administracion`, `gerente` | Ven facturas en cc-finanzas |

## Precondiciones

- Viaje `EN_RUTA` del chofer (spec 005), con `ReservaCredito` `ACTIVA` por el monto del servicio.
- La ruta tiene `destino.coordenadas`, `radioMetros` (300) y `distanciaKm` (Aula 120; D06).

## Pasos (camino feliz)

**Evidencias (subida por partes, D40a).** Para cada archivo (foto o firma en PNG):

1. `POST /api/v1/viajes/{viajeId}/evidencias` con `{evidenciaId, tipo, contentType, tamanoBytes}` e `Idempotency-Key`. Viajes crea la subida *multipart* en S3 (MinIO en local) con la llave `viajes/{viajeId}/evidencias/{evidenciaId}` y responde `201` con `{evidenciaId, tamanoParteBytes: 5242880, partes: [{numero, url, expiraEn}]}` (URL firmadas `PUT`, 15 min).
2. La app sube cada parte y guarda su `ETag` en SQLite. Si una parte falla, **reintenta solo esa parte**. Si las URL vencieron, `GET .../evidencias/{evidenciaId}/partes` devuelve las partes ya subidas (`ListParts`) y URL nuevas para las que faltan.
3. `POST .../evidencias/{evidenciaId}/completar` con `{partes: [{numero, etag}]}` e `Idempotency-Key`. Viajes completa la subida, verifica el tamaño y deja la evidencia `COMPLETA`.

**Entrega**

4. `POST /api/v1/viajes/{viajeId}/entrega` con `{entregaId, entregadoEn, posicion, precisionMetros, fotos: [evidenciaId], firma: {evidenciaId, nombreReceptor} | null, observacion}` e `Idempotency-Key`.
5. Viajes calcula la distancia (haversine) entre `posicion` y el destino de la ruta. Con `distancia ≤ radioMetros` **y** firma, en una transacción: `operacion_idempotente`, `EN_RUTA` → `ENTREGADO`, guarda la entrega, auditoría y `EntregaConfirmada` en el Outbox con `dentroGeocerca = true`, `conFirma = true`, `kmRecorridos = Ruta.distanciaKm` (D07), `tractoId`, `remolqueId` y `choferId`. Responde `200` con `{viajeId, entregaId, estado: "ENTREGADO", dentroGeocerca, distanciaMetros, conFirma}`. Si no cumple, spec 007.

**Reacciones (cada una con Inbox, idempotente por `eventId`)**

6. **Finanzas** (una transacción): Inbox; si no existe factura para ese `viajeId`, crea la `Factura` con número correlativo `FAC-000123`, monto de la reserva del `servicioId`, `saldo = monto`, `emitidaEl` = hoy en `America/La_Paz`, `venceEl = emitidaEl + 30 días` (D04), estado `EMITIDA` y copia de los datos del servicio que ya tiene por la cotización (ruta, carga, toneladas, fecha del viaje); `LineaCredito.consumir(monto)` (`reservado` baja, `utilizado` sube, con versión); reserva `ACTIVA` → `CONSUMIDA`; auditoría (`canal = SISTEMA`); `FacturaEmitida` en el Outbox con `cliente.razonSocial`, `cliente.correo` y `enlacePortal = <PORTAL_URL>/facturas/{facturaId}`.
7. **Flota**: reserva de unidad `CONFIRMADA` → `LIBERADA`; tracto y remolque `EN_VIAJE` → `DISPONIBLE`; suma `kmRecorridos` a `kmDesdeUltimoMantenimiento` del tracto y del remolque (el `kilometraje` del odómetro no cambia, spec 010); chofer `disponible = true`; revisa mantenimiento (spec 010: puede quedar `MANTENIMIENTO_PENDIENTE`).
8. **Analítica**: cierra `hecho_viaje` (spec 013).
9. **Viajes** consume `FacturaEmitida`: `ENTREGADO` → `CERRADO`, guarda `facturaId` y `numero`.
10. **n8n** (flujo `factura-emitida`, cola `n8n.eventos`): busca el `eventId` en `n8n_inbox` (PostgreSQL); si ya está, termina. Si no, envía el correo por SMTP (Mailpit en local; D37 en la nube): asunto "Factura FAC-000123 por 2.800,00 BOB", resumen y enlace; **después** del envío exitoso inserta el `eventId` con `ON CONFLICT DO NOTHING`. Si el SMTP falla, hace *nack* (la cola reintenta hasta `x-delivery-limit = 5` y luego va a la DLQ). Si n8n cae entre el envío y la inserción, el reintento puede repetir ese correo: se prefiere "al menos una vez" a perder un aviso (D63).

**Consulta.** El portal lista `GET /api/v1/facturas` (Finanzas) y muestra el POD con `GET /api/v1/viajes/{viajeId}/evidencias/{evidenciaId}` (URL firmada `GET` de 5 min).

## Reglas de negocio

| Regla | Valor |
|---|---|
| Geocerca | Distancia haversine a `Ruta.destino.coordenadas` ≤ `radioMetros` (300 m, D06). La precisión del GPS no se suma (D64) |
| Evidencia obligatoria | 1 a 3 fotos `FOTO_ENTREGA` (D65) `COMPLETA`s; sin foto → `400 VALIDACION`; una evidencia no `COMPLETA` → `422 EVIDENCIA_INCOMPLETA` |
| Firma | PNG con `nombreReceptor` (3 a 120 caracteres). Sin firma no es error: es entrega observada (spec 007) |
| Archivos | `image/jpeg` o `image/png`, máximo 15 MB (D66); partes de **5 MB** (la última puede ser menor; mínimo de S3). La demo usa una foto sin comprimir de más de 5 MB: 2 partes |
| Estados del viaje para subir | `FOTO_ENTREGA`, `FIRMA` y `FOTO_RECHAZO`: solo con el viaje `EN_RUTA`. `RECIBO_COMBUSTIBLE`: desde `CONFIRMADO` hasta `CERRADO` o `ENTREGA_RECHAZADA` (una carga puede sincronizarse después de la entrega, spec 009). En otro estado → `409 CONFLICTO_ESTADO` |
| Subidas abandonadas | Regla de ciclo de vida de S3 `AbortIncompleteMultipartUpload` a los 7 días (D67) |
| `kmRecorridos` | Siempre `Ruta.distanciaKm`, no el GPS (D07) |
| Quién entrega | Solo el chofer asignado; otro → `403 SIN_PERMISO` |
| Estado | Solo desde `EN_RUTA`; si ya hay entrega, con la misma clave la respuesta guardada, con otra `409 CONFLICTO_ESTADO` |
| Una factura por viaje | Autoridad de Finanzas: índice único `factura(viaje_id)` (propuesta 4.3). Un `EntregaConfirmada` repetido con otro `eventId` no crea otra |
| Número | Secuencia de PostgreSQL `factura_numero_seq`, `FAC-` + 6 dígitos. Puede tener saltos: es un documento interno de cobro, no factura fiscal (propuesta §2) |
| Vencimiento y mora | `venceEl = emitidaEl + 30 días`; "vencida" se calcula (`saldo > 0` y hoy > `venceEl`); mora = vencida hace más de 7 días (D04) |
| Reserva no `ACTIVA` al facturar | No se factura; el mensaje va a `finanzas.eventos.dlq` con `CONFLICTO_ESTADO` en el log (no debería pasar) |
| Cierre | Solo `ENTREGADO` → `CERRADO`; un `FacturaEmitida` sobre un viaje ya `CERRADO` se ignora |
| Correo | n8n no consulta servicios: todo viene en `FacturaEmitida`. Sin adjuntos (propuesta §2) |

### Máquina de estados de la `Factura` (Finanzas; specs 006 y 008)

| Desde | Hacia | Cuándo | Spec |
|---|---|---|---|
| — | `EMITIDA` | Llega `EntregaConfirmada` | 006 |
| `EMITIDA` | `PAGADA_PARCIAL` | Pago con `saldo` resultante > 0 | 008 |
| `EMITIDA`, `PAGADA_PARCIAL` | `PAGADA` | Pago con `saldo` resultante = 0 | 008 |
| `PAGADA_PARCIAL` | `PAGADA_PARCIAL` | Otro pago parcial | 008 |

`PAGADA` es final. "Vencida" no es un estado: se calcula en cada lectura (`vencida`, `diasVencida`). Anulación y notas de crédito quedan fuera de alcance.

### Evidencia (Viajes)

`SUBIENDO` → `COMPLETA`. Tipos: `FOTO_ENTREGA`, `FIRMA`, `FOTO_RECHAZO` (spec 007), `RECIBO_COMBUSTIBLE` (spec 009).

## Estados que cambia

| Entidad | Antes | Después |
|---|---|---|
| `Viaje` | `EN_RUTA` | `ENTREGADO` → `CERRADO` |
| `Factura` | — | `EMITIDA` |
| `ReservaCredito` | `ACTIVA` | `CONSUMIDA` |
| `LineaCredito` | — | `reservado` − monto, `utilizado` + monto |
| `ReservaUnidad` | `CONFIRMADA` | `LIBERADA` |
| Tracto y remolque | `EN_VIAJE` | `DISPONIBLE` o `MANTENIMIENTO_PENDIENTE` (spec 010) |

## Contratos que toca

- REST `contratos/openapi/viajes.yaml` (nuevas): `crearSubidaEvidencia` (`POST /api/v1/viajes/{viajeId}/evidencias`, `chofer`), `listarPartesEvidencia` (`GET .../evidencias/{evidenciaId}/partes`, `chofer`), `completarSubidaEvidencia` (`POST .../completar`, `chofer`), `obtenerEvidencia` (`GET .../evidencias/{evidenciaId}`: `chofer` propio, `despachador`, `comercial`, `gerente`; `cliente` propio **solo** `FOTO_ENTREGA`, `FIRMA` y `FOTO_RECHAZO`; `jefe_flota` solo `RECIBO_COMBUSTIBLE`), `registrarEntrega` (`POST .../entrega`, `chofer`), `obtenerEntrega` (`GET .../entrega`: `chofer` propio, `cliente` propio para el POD, `despachador`, `comercial`, `gerente`).
- REST `contratos/openapi/finanzas.yaml` (nuevas): `listarFacturas` (`GET /api/v1/facturas?estado&conSaldo&venceDesde&venceHasta&clienteId&cursor`; `cliente` propio, `administracion`, `gerente`, `comercial` con `clienteId`), `obtenerFactura` (`GET /api/v1/facturas/{facturaId}`, con sus pagos).
- Eventos: `EntregaConfirmada.v1` (Finanzas, Flota, Analítica), `FacturaEmitida.v1` (Viajes, n8n, Analítica). Sin cambios.
- GraphQL (F9): `facturas(filtro)`, `factura(id)`.

## Errores y caminos alternativos

| Caso | Qué pasa | Resultado visible |
|---|---|---|
| Fuera de la geocerca o sin firma | Spec 007 | `ENTREGA_OBSERVADA` |
| Parte que falla a la mitad | Se reintenta solo esa parte | Barra de avance sigue desde la parte |
| URL de parte vencida | `listarPartesEvidencia` da URL nuevas | — |
| S3 caído | `503 DEPENDENCIA_NO_DISPONIBLE` con `Retry-After` | La app reintenta |
| **FC1** Finanzas detenida | `EntregaConfirmada` espera en `finanzas.eventos`; al volver, factura | El viaje queda `ENTREGADO` hasta que llega `FacturaEmitida` |
| **FC2** Evento republicado | Inbox de Finanzas, Viajes y n8n lo descartan | Una factura y un correo |
| **FC3** Mensaje que no cumple el esquema | El consumidor lo rechaza sin reencolar | Va a `<cola>.dlq` |
| **FC5** RabbitMQ detenido | El Outbox guarda; el relay publica al volver | El viaje queda `ENTREGADO` hasta entonces |
| Cliente pide factura de otro (FK1) | — | `403 SIN_PERMISO` |

## Criterios de aceptación

- **Dado** el viaje del Aula `EN_RUTA` (2.800,00 BOB), **cuando** chofer1 entrega a 120 m del destino con foto y firma, **entonces** responde `200` con `ENTREGADO`, se publica `EntregaConfirmada` con `kmRecorridos = 120`, y en menos de 10 s existe `FAC-…` por 2.800,00 con `venceEl` a 30 días, la reserva está `CONSUMIDA`, `utilizado` subió 2.800,00, el viaje está `CERRADO` y Mailpit tiene un correo.
- **Dado** una foto de 7 MB, **cuando** la parte 2 falla, **entonces** la app reintenta solo la parte 2 y la evidencia queda `COMPLETA` (D40).
- **Dado** una entrega con una evidencia todavía `SUBIENDO`, **entonces** `422 EVIDENCIA_INCOMPLETA`.
- **FC1. Dado** `detener-finanzas-worker.sh`, **cuando** se entrega, **entonces** el mensaje queda en `finanzas.eventos` (15672 en local; `tunel-consolas.sh` en la nube) y el viaje `ENTREGADO`; **y cuando** se enciende, **entonces** hay factura, `CERRADO` y correo.
- **FC2. Dado** `republicar-evento.sh <eventId>` de un `FacturaEmitida` ya procesado, **entonces** Mailpit sigue con un solo correo y Viajes no cambia nada.
- **Dado** un cliente, **cuando** pide una evidencia `RECIBO_COMBUSTIBLE` de su viaje, **entonces** `403 SIN_PERMISO`.
- **FC3. Dado** un mensaje en `viajes.entrega-confirmada.v1` sin `viajeId`, **entonces** termina en `finanzas.eventos.dlq` y no se factura (solo local).
- **FC5. Dado** `rabbitmq` detenido, **cuando** se entrega, **entonces** `200`, la fila queda en `outbox_eventos` sin `publicadoEn`; **y al volver** el broker, se publica y sigue el flujo (solo local).
- **FF3. Dado** el furgón de 9.950 km en el viaje del Aula, **cuando** se confirma la entrega, **entonces** queda con `kmDesdeUltimoMantenimiento = 10070` y en `MANTENIMIENTO_PENDIENTE` (spec 010).
- **Dado** el cliente A, **cuando** pide `GET /facturas/{id}` de una factura del cliente B, **entonces** `403 SIN_PERMISO`.

## Cómo se demuestra en la defensa

Paso 6 del escenario en el iPhone dentro de la geocerca del Aula: se muestran en paralelo cc-operaciones (`ENTREGADO` → `CERRADO`), cc-finanzas (la factura), cc-flota (el furgón en `MANTENIMIENTO_PENDIENTE`, FF3) y Mailpit (el correo). FC1 y FC2 con sus scripts; FC3 y FC5 solo en local.

## Cambios de contrato pendientes

| Contrato | Cambio | Tipo |
|---|---|---|
| `contratos/openapi/viajes.yaml → Servicio` | Agregar opcionales `iniciadoEn`, `entregadoEn`, `facturaId` y `numeroFactura` (el portal muestra el avance y enlaza la factura; Viajes los guarda en los pasos 5 y 9) | Compatible (misma versión) |
