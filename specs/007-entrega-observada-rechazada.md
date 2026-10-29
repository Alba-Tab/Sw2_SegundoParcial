# 007 · Entrega observada y entrega rechazada

Estado: **revisado** · Casos de uso: CU-07 Confirmar entrega (caminos alternativos: entrega observada y rechazo) · Responsable: Brayan Albaro Garcia Taboada

Dos caminos que se apartan de la spec 006. **Observada:** el chofer entrega fuera de la geocerca o sin firma; el viaje queda en revisión y el despachador aprueba (sigue la 006) o rechaza. **Rechazada:** el receptor no acepta la carga; el chofer registra foto y motivo. En los dos rechazos, Finanzas no factura y libera el crédito, y Flota libera la unidad. Qué pasa con la carga después queda fuera de alcance. Decisiones: D06, D07, D19, D45. Propuesta 5.7 y 5.8.

## Actores y roles

| Actor | Rol | Qué hace |
|---|---|---|
| Chofer | `chofer` | Registra la entrega (que resulta observada) o el rechazo del receptor |
| Receptor | — | Firma, no firma o rechaza la carga |
| Despachador | `despachador` | Revisa la evidencia en cc-operaciones y aprueba o rechaza la observada |
| Gerente, comercial | `gerente`, `comercial` | Ven la entrega observada; no deciden |
| Cliente | `cliente` | Ve "Entrega en revisión" o "Entrega rechazada" en el portal |
| Finanzas, Flota, Analítica | — | Reaccionan a `EntregaRechazada`; Analítica alerta (spec 013) |

## Precondiciones

- Viaje `EN_RUTA` del chofer (spec 005), con evidencias subidas por partes (spec 006, pasos 1 a 3).
- **Para la demo** (el viaje del paso 6 ya quedó `CERRADO`): `plataforma/scripts/demo/preparar-entrega.sh` confirma un servicio nuevo del Aula de **10 t de `INSUMOS`** por cada escenario, uno para FO5 y otro para FO7 (tarifa 100 × factor 1,10 = 110 BOB/t: **1.100,00 BOB**, D10). Se usa `INSUMOS` porque acepta `FURGON` o `PLATAFORMA` (D11): con granos podría no quedar furgón libre (uno en `MANTENIMIENTO_PENDIENTE` tras FF3 y otro en el viaje de chofer2). El script muestra el chofer asignado; se inicia sesión en el iPhone con ese chofer (contraseñas locales de la semilla, D12) y se inicia el viaje.
- **Ubicación fuera de la geocerca:** como la defensa ocurre dentro del Aula, FO5 usa ubicación simulada en Xcode con el archivo `plataforma/demo/gpx/fuera-geocerca.gpx` (un punto a 2.170 m del destino). Variante en vivo sin Xcode: entregar dentro de la geocerca **sin firma** (`SIN_FIRMA`).

## Pasos

**A. Entrega observada**

1. El chofer registra la entrega igual que en la 006 (`POST /api/v1/viajes/{viajeId}/entrega`).
2. Viajes calcula las razones: `FUERA_GEOCERCA` si la distancia al destino supera `radioMetros` (300 m), `SIN_FIRMA` si `firma` es `null`. Con al menos una, en una transacción: `EN_RUTA` → `ENTREGA_OBSERVADA`, guarda la entrega con sus razones y `distanciaMetros`, auditoría y `EntregaObservada` en el Outbox. Responde `200` con `estado: "ENTREGA_OBSERVADA"`; la app muestra "Entrega en revisión del despachador".
3. Analítica crea la alerta `ENTREGA_OBSERVADA` para `despachador` y `gerente` (spec 013).
4. El despachador abre la alerta en cc-operaciones: `GET /api/v1/viajes/{viajeId}/entrega` con razones, distancia, mapa (destino, radio y posición) y las fotos y la firma (URL firmadas de 5 min).
5. **Aprueba:** `POST /api/v1/viajes/{viajeId}/entrega/aprobacion` con `{nota}` e `Idempotency-Key`. En una transacción: `ENTREGA_OBSERVADA` → `ENTREGADO`, auditoría y `EntregaConfirmada` con `dentroGeocerca` y `conFirma` **como se registraron** y `aprobadaPor = <sub>`. Desde aquí sigue la spec 006 (factura, unidad, cierre, correo).
6. **Rechaza:** `POST /api/v1/viajes/{viajeId}/entrega/rechazo` con `{motivo}` e `Idempotency-Key`. En una transacción: `ENTREGA_OBSERVADA` → `ENTREGA_RECHAZADA`, auditoría y `EntregaRechazada` con `origenRechazo = DESPACHADOR`, `motivo`, `kmRecorridos = Ruta.distanciaKm` (D07), `tractoId`, `remolqueId` y `choferId`. Sigue el paso 10.
7. **Push (D45).** El consumidor interno del Outbox de Viajes, después del commit, avisa al chofer "Entrega aprobada" (un `EntregaConfirmada` con `aprobadaPor`) o "Entrega rechazada" (un `EntregaRechazada` con `origenRechazo = DESPACHADOR`); lee el chofer del viaje en su base. Idempotente por `eventId`, `collapse_key = viajeId`. En iPhone se omite sin error.

**B. Rechazo del receptor**

8. El chofer elige "El receptor rechaza", toma de 1 a 3 fotos `FOTO_RECHAZO` y escribe o dicta el motivo.
9. `POST /api/v1/viajes/{viajeId}/rechazo` con `{entregaId, rechazadaEn, posicion, motivo, fotos: [evidenciaId]}` e `Idempotency-Key`. En una transacción: `EN_RUTA` → `ENTREGA_RECHAZADA`, auditoría y `EntregaRechazada` con `origenRechazo = RECEPTOR`. Responde `200`.

**Reacciones a `EntregaRechazada` (Inbox, idempotentes)**

10. **Finanzas:** no factura; reserva `ACTIVA` → `LIBERADA` (`reservado` baja el monto); la cotización sigue `ACEPTADA` (no se reutiliza).
11. **Flota:** reserva de unidad → `LIBERADA`; tracto y remolque `EN_VIAJE` → `DISPONIBLE`; suma `kmRecorridos` a `kmDesdeUltimoMantenimiento` (el camión viajó igual; el odómetro no cambia, spec 010) y revisa mantenimiento (spec 010); chofer disponible.
12. **Analítica:** cierra el hecho como rechazado y crea la alerta `ENTREGA_RECHAZADA` (spec 013).

## Reglas de negocio

| Regla | Valor |
|---|---|
| Razones de observación | `FUERA_GEOCERCA` (distancia > 300 m, D06) y `SIN_FIRMA`; pueden ir las dos |
| Quién decide la observada | Solo `despachador`; otro rol → `403 SIN_PERMISO` |
| Nota al aprobar | Opcional, 3 a 300 caracteres |
| Motivo al rechazar | Obligatorio, 3 a 300 caracteres (despachador y chofer); sin motivo → `400 VALIDACION` |
| Fotos del rechazo | 1 a 3 `FOTO_RECHAZO` `COMPLETA`s; si no, `400 VALIDACION` o `422 EVIDENCIA_INCOMPLETA` |
| Geocerca en el rechazo | Se guarda la distancia, pero no se valida: el receptor puede rechazar donde esté (D68) |
| Sin plazo | La observada espera hasta que el despachador decide; su alerta sigue `ABIERTA` |
| Una decisión | Bloqueo optimista con `version` en el `Viaje`: la segunda decisión recibe `409 CONFLICTO_ESTADO` |
| Otra entrega sobre una observada | No se reemplaza; con otra clave `409 CONFLICTO_ESTADO` (decide el despachador) |
| Rechazo del receptor | Solo desde `EN_RUTA`; desde `ENTREGA_OBSERVADA` decide el despachador → `409 CONFLICTO_ESTADO` |
| `kmRecorridos` en el rechazo | `Ruta.distanciaKm` (D07), igual que en la entrega |
| Crédito en el rechazo | Se libera la reserva; la cotización no vuelve a `VIGENTE` (igual que `origen = USUARIO` en la spec 004) |
| Cancelar en `ENTREGA_OBSERVADA` | `409 CANCELACION_NO_PERMITIDA` (spec 004) |
| Lo que ve el cliente | `ENTREGA_OBSERVADA` → "Entrega en revisión"; `ENTREGA_RECHAZADA` → "Entrega rechazada" con el motivo |

## Estados que cambia

| Desde | Hacia | Cuándo (máquina de la spec 003) |
|---|---|---|
| `EN_RUTA` | `ENTREGA_OBSERVADA` | Entrega fuera de la geocerca o sin firma |
| `EN_RUTA` | `ENTREGA_RECHAZADA` | El receptor rechaza |
| `ENTREGA_OBSERVADA` | `ENTREGADO` | El despachador aprueba (luego `CERRADO`, spec 006) |
| `ENTREGA_OBSERVADA` | `ENTREGA_RECHAZADA` | El despachador rechaza |

| Entidad | Cambio en el rechazo |
|---|---|
| `ReservaCredito` | `ACTIVA` → `LIBERADA` |
| `ReservaUnidad` | `CONFIRMADA` → `LIBERADA` |
| Tracto y remolque | `EN_VIAJE` → `DISPONIBLE` o `MANTENIMIENTO_PENDIENTE` |

`ENTREGA_RECHAZADA` es final.

## Contratos que toca

- REST `contratos/openapi/viajes.yaml` (nuevas): `aprobarEntregaObservada` (`POST /api/v1/viajes/{viajeId}/entrega/aprobacion`, `despachador`), `rechazarEntregaObservada` (`POST /api/v1/viajes/{viajeId}/entrega/rechazo`, `despachador`), `registrarRechazoEntrega` (`POST /api/v1/viajes/{viajeId}/rechazo`, `chofer`). Respuestas `200`, `400`, `401`, `403`, `404`, `409`, `422`, `503`. Reusa `registrarEntrega`, `obtenerEntrega` y las de evidencias de la spec 006.
- Eventos: `EntregaObservada.v1` (Analítica), `EntregaConfirmada.v1` con `aprobadaPor`, `EntregaRechazada.v1` (Finanzas, Flota, Analítica). Sin cambios.
- Push: consumidor interno del Outbox (D45), no es un evento del broker.
- GraphQL (F9): `aprobarEntregaObservada(viajeId, nota)`, `rechazarEntregaObservada(viajeId, motivo)`, `entregasObservadas`. Cada mutación lleva el argumento `claveIdempotencia: ID!`, que el Gateway reenvía como `Idempotency-Key` (spec 016).

## Errores y caminos alternativos

| Caso | Respuesta |
|---|---|
| Aprobar o rechazar un viaje que no está `ENTREGA_OBSERVADA` | `409 CONFLICTO_ESTADO` |
| Dos despachadores deciden a la vez | El segundo, `409 CONFLICTO_ESTADO` |
| Viaje inexistente | `404 NO_ENCONTRADO` |
| `gerente` intenta decidir | `403 SIN_PERMISO` |
| Reenvío con la misma clave | La respuesta guardada; no se publica otro evento |
| FCM no responde | El consumidor del Outbox reintenta (5 intentos con espera exponencial, D69); el estado del viaje no depende del push |
| Finanzas o Flota caídos | `EntregaRechazada` espera en su cola y se procesa al volver |

## Criterios de aceptación

- **FO5 (estado). Dado** el viaje de `preparar-entrega.sh` `EN_RUTA` y el GPX `fuera-geocerca.gpx` cargado en Xcode, **cuando** el chofer entrega a 2.170 m del destino con foto y firma, **entonces** responde `200` con `ENTREGA_OBSERVADA`, se publica `EntregaObservada` con `razones = [FUERA_GEOCERCA]` y `distanciaMetros = 2170`, y no hay factura.
- **Dado** una entrega dentro de la geocerca sin firma, **entonces** `ENTREGA_OBSERVADA` con `razones = [SIN_FIRMA]`.
- **FO5 (alerta). Dado** esa entrega observada, **entonces** en menos de 10 s aparece la alerta `ENTREGA_OBSERVADA` en la campana del despachador (H8).
- **FO5 (aprobación). Dado** la entrega observada, **cuando** el despachador aprueba en cc-operaciones, **entonces** el viaje queda `ENTREGADO`, se publica `EntregaConfirmada` con `aprobadaPor`, y siguen la factura, el cierre y el correo de la spec 006; el emulador de Android recibe "Entrega aprobada" (H9).
- **Dado** la entrega observada, **cuando** el despachador rechaza con motivo, **entonces** `ENTREGA_RECHAZADA` con `origenRechazo = DESPACHADOR`, la reserva de crédito `LIBERADA` y la unidad `DISPONIBLE`.
- **FO7. Dado** el segundo viaje de `preparar-entrega.sh` `EN_RUTA`, **cuando** el chofer registra el rechazo con foto y motivo, **entonces** el viaje queda `ENTREGA_RECHAZADA`, el disponible del cliente sube el monto del servicio (1.100,00 BOB), la unidad vuelve a `DISPONIBLE` y aparece la alerta `ENTREGA_RECHAZADA`.
- **Dado** `EntregaRechazada` entregado dos veces a Finanzas, **entonces** `reservado` baja una sola vez.
- **Dado** un rechazo sin foto, **entonces** `400 VALIDACION`.
- **Dado** un viaje `ENTREGA_OBSERVADA`, **cuando** el chofer intenta registrar el rechazo, **entonces** `409 CONFLICTO_ESTADO`.

## Cómo se demuestra en la defensa

FO5: con el viaje de `preparar-entrega.sh` y el GPX `fuera-geocerca.gpx` en Xcode (o, en vivo, sin firma dentro del Aula), el chofer entrega desde el iPhone; aparece la alerta en cc-operaciones (H8) y el despachador aprueba con la evidencia a la vista (H9); se ve la factura nacer. FO7: con el segundo viaje preparado, el chofer registra el rechazo con foto y motivo; en cc-finanzas el disponible del cliente sube y en cc-flota la unidad vuelve a `DISPONIBLE`.
