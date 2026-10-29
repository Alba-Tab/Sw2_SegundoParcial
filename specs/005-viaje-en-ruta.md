# 005 · Viaje en ruta y sincronización sin conexión

Estado: **revisado** · Casos de uso: CU-05 Seguir viaje, CU-06 Registrar evento en ruta, CU-08 Sincronizar registros sin conexión · Responsable: Brayan Albaro Garcia Taboada

El chofer descarga su viaje con señal, registra el inicio y opera sin red: GPS, bitácora por voz, frenadas y alertas de fatiga se guardan primero en el celular y se envían al recuperar la señal, cada operación con su clave. Viajes guarda el GPS por lotes en DynamoDB y la última posición en PostgreSQL. Es el requisito 11 (offline), 12 (mala conexión) y 13 (sincronización idempotente). Decisiones: D08, D13, D19, D20, D22, D27, D38, D45, D46. Propuesta 4.3, 4.4, 5.5 y 6.5.

## Actores y roles

| Actor | Rol | Qué hace |
|---|---|---|
| Chofer | `chofer` | Descarga sus viajes, registra el inicio, GPS, hitos y eventos de conducción (app React Native + Paper, D46) |
| Despachador | `despachador` | Ve el mapa en vivo y la bitácora (cc-operaciones) |
| Atención comercial, gerente | `comercial`, `gerente` | Solo lectura del mapa |
| Cliente | `cliente` | Sigue su viaje en el portal (`GET /servicios/{id}` trae `ultimaPosicion`) |
| Agente | `agente_lectura` | Lee viajes en curso y bitácora por MCP (spec 014) |
| Flota | — | Consume `ViajeIniciado`: tracto y remolque `RESERVADA` → `EN_VIAJE` (D20) |
| Analítica | — | Consume `ViajeIniciado`, `HitoRegistrado`, `PosicionActualizada`, `EventoConduccionRegistrado` (spec 013) |

## Precondiciones

- Viaje `CONFIRMADO` con `confirmacionCompleta = true` y `choferUsuarioSub` igual al `sub` del chofer (spec 003).
- La app inició sesión con `offline_access` (D27): el *refresh token* sobrevive sin red; el *access token* dura 5 min.
- La app registró su dispositivo: `PUT /api/v1/dispositivos/mio` con `dispositivoId` (UUID generado al instalar), `plataforma` (`ANDROID`, `IOS`) y `tokenPush` (solo Android, D45). Es un reemplazo completo, no una operación de negocio: no usa `operacion_idempotente`.

## Pasos (camino feliz)

1. **Descarga (con señal).** `GET /api/v1/viajes/mios`: viajes del `sub` en `CONFIRMADO`, `EN_RUTA` o `ENTREGA_OBSERVADA`, más los terminados en los últimos 7 días (D50). Trae ruta (destino, `radioMetros`, `distanciaKm`), cliente, carga, toneladas, fecha y placa; **no trae montos** (D51). La app lo guarda en SQLite.
2. **Inicio.** El chofer pulsa "Iniciar viaje". La app crea la operación `INICIO` en la cola local con su `opId` (UUID generado en ese momento, no al enviar) y `iniciadoEn` del reloj del celular.
3. Al enviar: `POST /api/v1/viajes/{viajeId}/inicio` con `{dispositivoId, iniciadoEn, posicion}` e `Idempotency-Key = opId`. Viajes, en una transacción: `operacion_idempotente`, `CONFIRMADO` → `EN_RUTA`, `iniciadoEn`, auditoría (`canal = APP_CHOFER`) y `ViajeIniciado` en el Outbox. Responde `200` con el viaje.
4. **GPS.** La app guarda un punto cada 20 s o cada 100 m, lo que ocurra primero (D52, dentro de 4.4), con `seq` creciente por dispositivo y viaje.
5. **Lote.** Cada 90 s con señal (4.4: 1–2 min), la app envía hasta 100 puntos pendientes: `POST /api/v1/viajes/{viajeId}/gps/lotes` con `{dispositivoId, puntos: [{seq, registradaEn, lat, lng, velocidadKmh, precisionMetros}]}` e `Idempotency-Key = loteId`.
6. Viajes escribe el lote en `gps_puntos` con `BatchWriteItem` en grupos de **25**; reintenta los `UnprocessedItems` (ver reglas). Después, en una transacción de PostgreSQL: si el punto más nuevo es posterior a `ultima_posicion`, la actualiza y, con el viaje en `EN_RUTA`, deja **un** `PosicionActualizada` en el Outbox con ese punto y `puntosEnLote`. Por último escribe `sync_cursor` (`dispositivoId`, `viajeId`) → `ultimaSecuencia`, solo si es mayor que la guardada. Responde `200` con `{aceptados, ultimaSecuencia, ultimaPosicionActualizada}`; la app borra esos puntos de SQLite.
7. **Hitos (bitácora por voz, CU-06).** El chofer dicta; whisper.rn con el modelo `base` (D38) transcribe sin red; el chofer revisa el texto y elige el tipo. El audio nunca sale del celular (D53). Al enviar: `POST /api/v1/viajes/{viajeId}/hitos` con `{hitoId, tipo, descripcion, posicion, registradoEn, origen: VOZ|TEXTO}`. Viajes guarda el hito y publica `HitoRegistrado`.
8. **Eventos de conducción (CU-06).** Frenada brusca o fatiga detectadas en el celular → `POST /api/v1/viajes/{viajeId}/eventos-conduccion` con `{eventoId, tipo, magnitudG, posicion, registradoEn}`. Viajes publica `EventoConduccionRegistrado`.
9. **Seguimiento (CU-05).** El mapa en vivo lee `GET /api/v1/viajes?estado=EN_RUTA` (posición desde `ultima_posicion`); el recorrido completo, `GET /api/v1/viajes/{viajeId}/recorrido` (consulta por `viajeId` en DynamoDB, nunca un *scan*).
10. La entrega sigue en la spec 006 (o 007).

## Reglas de negocio

**Viaje e inicio**

| Regla | Valor |
|---|---|
| Quién | Solo el chofer asignado (`choferUsuarioSub = sub`); otro → `403 SIN_PERMISO` |
| Estado para iniciar | `CONFIRMADO` con `confirmacionCompleta = true`. Con `false` → `409 CONFIRMACION_EN_CURSO` (la app reintenta). Otro estado → `409 CONFLICTO_ESTADO` |
| `iniciadoEn` | ≤ hora del servidor + 2 min (desfase de reloj); si no, `400 VALIDACION` |
| Un viaje en ruta | Un chofer tiene como máximo un viaje `EN_RUTA` (D11); un segundo inicio → `409 CONFLICTO_ESTADO` |
| **Cancelado sin señal (plan F7)** | Si el viaje se canceló mientras el chofer registraba el inicio sin señal, al sincronizar Viajes responde `409 CONFLICTO_ESTADO`; la app lee `GET /viajes/{id}`, ve `CANCELADO`, muestra **"Viaje cancelado; llama al despachador"** y descarta la cola de ese viaje (la guarda 7 días en "Descartadas", D54) |
| Cancelar después del inicio | `409 CANCELACION_NO_PERMITIDA` (spec 004) |

**GPS y DynamoDB (propuesta 4.4)**

| Regla | Valor |
|---|---|
| Tablas | `gps_puntos` (PK `viajeId`, SK `ts#seq`, p. ej. `2026-11-03T12:10:30Z#001042`, TTL `expiraEn` = `registradaEn` + 90 días) y `sync_cursor` (PK `dispositivoId`, SK `viajeId` (D55): la propuesta 4.4 no tenía SK; se agrega para que los puntos atrasados de un viaje anterior no pisen el cursor del actual). Modo provisionado: **20 WCU** `gps_puntos` y **5 WCU** `sync_cursor` (total gratuito 25) |
| Lote de la app | 1 a 100 puntos (D56); `seq` sin repetir dentro del lote; `registradaEn` ≤ ahora + 2 min y ≥ `iniciadoEn` − 10 min (D57) |
| Escritura | `BatchWriteItem` de hasta 25 elementos. `UnprocessedItems`: hasta 5 reintentos con espera exponencial y aleatoria desde 100 ms (100, 200, 400, 800, 1.600 ms). Si quedan pendientes → `503 DEPENDENCIA_NO_DISPONIBLE` con `Retry-After: 10` |
| Idempotencia del lote | **Excepción escrita en 000 §4.1.** `Idempotency-Key` obligatoria (es el `loteId`, va a los logs), pero la **autoridad es la llave de DynamoDB** (`viajeId` + `ts#seq`, propuesta 4.3): un reenvío vuelve a escribir los mismos puntos y responde `200` con el resultado recalculado. No se usa `operacion_idempotente`, así que no hay `422 IDEMPOTENCIA_CUERPO_DISTINTO` ni `409 IDEMPOTENCIA_EN_PROCESO`: con la misma clave y otros puntos, cada punto se escribe por su llave |
| `PosicionActualizada` | Uno por lote (D19), solo si el lote **avanzó** `ultima_posicion` y el viaje está `EN_RUTA`. Un reenvío no la avanza, así que no duplica el evento |
| Puntos tardíos | Se aceptan con el viaje en `EN_RUTA`, `ENTREGA_OBSERVADA`, `ENTREGADO`, `CERRADO` o `ENTREGA_RECHAZADA` (llegan después de la entrega); solo con `EN_RUTA` mueven el mapa. En `CONFIRMADO`, `PROGRAMANDO` o `CANCELADO` → `409 CONFLICTO_ESTADO` |
| *Throttling* | No es un error del chofer (FO4): la app respeta `Retry-After` y la pantalla solo muestra "Pendientes: N" |
| `sync_cursor` | Último `seq` aceptado por dispositivo **y viaje**; se actualiza con una escritura condicional (solo si el `seq` nuevo es mayor). Al arrancar, la app consulta `GET /api/v1/dispositivos/{dispositivoId}/cursor?viajeId=` y borra de SQLite lo ya aceptado (si se cerró antes de recibir la respuesta). Solo lo lee el chofer que registró ese dispositivo (mismo `sub`); otro → `403 SIN_PERMISO`. Si su escritura falla, no se responde error (la respuesta del lote ya lo dice) |

**Hitos y conducción**

| Regla | Valor |
|---|---|
| Tipos de hito | `BLOQUEO`, `PARADA`, `PUNTO_CONTROL`, `FALLA_MECANICA`, `OTRO` (enum de `HitoRegistrado`); todos publican el evento |
| Descripción | 3 a 500 caracteres |
| En movimiento | Con velocidad > 5 km/h la app solo permite dictar, no escribir (6.5; umbral en D58) |
| Frenada brusca | Desaceleración ≥ **0,4 g** (D08) sostenida 300 ms con velocidad > 20 km/h (D59); acelerómetro a 10 Hz; una por cada 10 s. Viajes rechaza `FRENADA_BRUSCA` con `magnitudG < 0,4` → `400 VALIDACION` |
| Fatiga | Modelo TFLite con la cámara **en primer plano** (limitación de iOS): ojos cerrados ≥ 1,5 s o 3 bostezos en 2 min (D60) → alarma sonora y `ALERTA_FATIGA`. Las imágenes se descartan en el celular; la pantalla dibuja cajas y etiquetas (FO6) |
| Estados válidos | Hitos y eventos: `EN_RUTA` y los estados posteriores a la entrega (llegan tarde); otro → `409 CONFLICTO_ESTADO` |

**Motor de sincronización (CU-08, app con Clean, SQLite + Drizzle)**

| Regla | Valor |
|---|---|
| Cola | Tabla `operacion_pendiente` (`opId`, `viajeId`, `tipo`, `cuerpo`, `creadaEn`, `intentos`, `proximoIntentoEn`, `estado`); el GPS va en `punto_gps` |
| Orden por viaje | `INICIO` primero; luego hitos, eventos y cargas de combustible (spec 009) en orden de creación; las partes de las fotos. Una `CARGA_COMBUSTIBLE` con foto sale **después de completar** su evidencia `RECIBO_COMBUSTIBLE`; `ENTREGA` o `RECHAZO` al final, solo con sus evidencias completas (spec 006). Los lotes de GPS salen aparte, después de confirmado el `INICIO` |
| Concurrencia | Una petición a la vez por viaje; un lote de GPS a la vez; hasta 2 partes de foto en paralelo (D61) |
| Tiempo de espera | 15 s por petición; 60 s por parte de foto (D62) |
| Reintento | Red, `5xx`, `429`, `409 IDEMPOTENCIA_EN_PROCESO` y `409 CONFIRMACION_EN_CURSO` (inicio mientras termina la saga): espera exponencial con *full jitter*, base 1 s, ×2, máximo 5 min, sin límite de intentos; `Retry-After` manda si viene |
| Error definitivo | Otro `4xx` → `FALLIDA`, visible en "Pendientes con error" con su `codigo`; no se reintenta sola |
| Disparadores | Cambio de conectividad, app al frente, cada 90 s con señal y tarea en segundo plano |
| Sesión | Renueva el *access token* antes de cada tanda. Si la renovación da `invalid_grant`, pide iniciar sesión **sin borrar la cola** |

**Reasignación (D13, fuera del plan base).** Si se incluye (+1,5 j), necesita un evento `ViajeReasignado` y esta regla de conflicto: (1) registros del chofer anterior con `registradoEn` < `reasignadoEn` se aceptan como historial; (2) un `INICIO` del chofer anterior después de la reasignación → `403 SIN_PERMISO` y la app muestra "Viaje reasignado; llama al despachador"; (3) **gana la entrega con evidencia**: una entrega del chofer anterior con foto se acepta con las reglas de la spec 006 y Analítica crea la alerta `CONFLICTO_REASIGNACION` para el despachador.

## Estados que cambia

| Entidad | Cambio |
|---|---|
| `Viaje` (Viajes) | `CONFIRMADO` → `EN_RUTA` (003, fila "El chofer registra el inicio"); `iniciadoEn`, `ultima_posicion` |
| Tracto y remolque (Flota) | `RESERVADA` → `EN_VIAJE` al consumir `ViajeIniciado` (D20) |
| Operación local (app) | `PENDIENTE` → `ENVIANDO` → `CONFIRMADA`, o `FALLIDA`, o `DESCARTADA` (viaje cancelado) |

## Contratos que toca

- REST, `contratos/openapi/viajes.yaml` (todas nuevas): `listarMisViajes` (`GET /api/v1/viajes/mios`, `chofer`), `listarViajes` (`GET /api/v1/viajes`, `despachador`, `comercial`, `gerente`, `jefe_flota`, `agente_lectura`), `obtenerViaje` (`GET /api/v1/viajes/{viajeId}`), `iniciarViaje` (`POST .../inicio`), `registrarLoteGps` (`POST .../gps/lotes`), `obtenerRecorrido` (`GET .../recorrido`, cursor, 1.000 puntos por página), `registrarHito` (`POST .../hitos`), `listarHitos` (`GET .../hitos[?texto=]`, sin `texto` las 20 más nuevas; `chofer` propio, `despachador`, `comercial`, `gerente`, `agente_lectura`; el texto se busca con `ILIKE` escapando `%` y `_`; spec 014), `registrarEventoConduccion` (`POST .../eventos-conduccion`), `registrarDispositivo` (`PUT /api/v1/dispositivos/mio`), `obtenerCursorSincronizacion` (`GET /api/v1/dispositivos/{dispositivoId}/cursor?viajeId=`, solo el chofer dueño del dispositivo). Todo `POST` lleva `Idempotency-Key`. Respuestas: `iniciarViaje`, `registrarHito` y `registrarEventoConduccion` → `200`, `400`, `401`, `403`, `404`, `409`, `422` (`IDEMPOTENCIA_CUERPO_DISTINTO`), `503`; `registrarLoteGps` → `200`, `400`, `401`, `403`, `404`, `409 CONFLICTO_ESTADO`, `503` (sin `422`, excepción de 000 §4.1).
- Eventos: `ViajeIniciado.v1`, `PosicionActualizada.v1`, `HitoRegistrado.v1`, `EventoConduccionRegistrado.v1` (sin cambios).
- GraphQL (F9): `viajesEnCurso`, `recorrido(viajeId)`.

## Errores y caminos alternativos

| Caso | Respuesta | En la app |
|---|---|---|
| Inicio, hito o evento: misma clave, mismo cuerpo | La respuesta guardada | Marca `CONFIRMADA` |
| Inicio, hito o evento: misma clave, otro cuerpo | `422 IDEMPOTENCIA_CUERPO_DISTINTO` | `FALLIDA` (error de la app) |
| Lote de GPS reenviado (misma clave, mismos puntos) | `200`; los puntos se reescriben iguales; no hay otro `PosicionActualizada` | Marca los puntos como aceptados |
| Lote de GPS con la misma clave y otros puntos | `200`; cada punto se escribe por su llave `ts#seq` (la clave no se compara) | — |
| Viaje de otro chofer | `403 SIN_PERMISO` | `FALLIDA` |
| Viaje cancelado al sincronizar el inicio | `409 CONFLICTO_ESTADO` | "Viaje cancelado; llama al despachador" |
| DynamoDB con *throttling* sostenido | `503 DEPENDENCIA_NO_DISPONIBLE`, `Retry-After: 10` | Reintenta; sin mensaje de error |
| PostgreSQL o RabbitMQ caídos | `503 DEPENDENCIA_NO_DISPONIBLE`; el Outbox publica al volver | Reintenta |
| Token vencido sin red | No se envía nada; la cola espera | "Sin conexión · N pendientes" |

## Criterios de aceptación

- **Dado** chofer1 con el viaje del Aula `CONFIRMADO`, **cuando** inicia con señal, **entonces** responde `200`, el viaje queda `EN_RUTA`, se publica `ViajeIniciado` y en Flota el tracto y el remolque quedan `EN_VIAJE`.
- **FO1. Dado** el iPhone en modo avión, **cuando** el chofer inicia, dicta un hito `BLOQUEO`, registra una frenada y recorre 10 min, **y luego** recupera la señal, **entonces** cada operación llega **una sola vez** (una fila por `opId` en `operacion_idempotente`, un `HitoRegistrado`, un `EventoConduccionRegistrado`) y los puntos quedan en `gps_puntos` sin duplicados.
- **FO2. Dado** Network Link Conditioner con 100 % de pérdida intermitente, **cuando** la app sincroniza, **entonces** los registros muestran esperas crecientes (1, 2, 4… s con variación) y todo termina `CONFIRMADA`.
- **FO3.** En H4 se demuestra con `POST /api/v1/servicios` (spec 003, mismo mecanismo); desde H5 se repite con el inicio: **dado** un `POST .../inicio` ya completado, **cuando** se repite con curl con la misma clave, **entonces** recibe la misma respuesta; **y con** otro cuerpo, `422 IDEMPOTENCIA_CUERPO_DISTINTO`.
- **FO4. Dado** el adaptador de DynamoDB con *throttling* simulado (devuelve `UnprocessedItems` durante 30 s), **cuando** la app envía 480 puntos, **entonces** Viajes responde `503` con `Retry-After`, la app reintenta sin mostrar error y al final hay 480 elementos en `gps_puntos` y un `PosicionActualizada` por lote que avanzó la posición.
- **FO6. Dado** la cámara en primer plano sin red, **cuando** el chofer cierra los ojos 2 s, **entonces** suena la alarma, se ven las cajas y etiquetas, y queda un `ALERTA_FATIGA` en la cola.
- **Plan F7. Dado** el inicio registrado sin señal y el viaje cancelado por el cliente mientras tanto, **cuando** la app sincroniza, **entonces** recibe `409 CONFLICTO_ESTADO`, muestra "Viaje cancelado; llama al despachador" y no envía el resto de la cola de ese viaje.
- **Dado** un lote reenviado con la misma clave, **entonces** `ultima_posicion` no cambia y no se publica otro `PosicionActualizada`.
- **FF4 (TTL). Dado** puntos sembrados en la nube con `expiraEn` vencido hace 3 días o más, **cuando** se pide el recorrido, **entonces** esos puntos ya no aparecen (DynamoDB Local no borra por TTL, N10).
- **Dado** chofer2 que pide `GET /viajes/{id}` del viaje de chofer1, **entonces** `403 SIN_PERMISO`.

## Cómo se demuestra en la defensa

Pasos 4 y 5 del escenario: el iPhone en modo avión registra inicio, hitos por voz, frenadas y fatiga (FO6); al quitar el modo avión, cc-operaciones mueve el camión en el mapa y la consola de RabbitMQ muestra un `PosicionActualizada` por lote (FO1). FO2 con Network Link Conditioner; FO3 por curl; FO4 con la prueba de *throttling* simulado (opcional en la nube con `throttle-gps.sh`). En el emulador de Android se ve el push "Viaje asignado" (D45).

## Cambios de contrato pendientes

| Contrato | Cambio | Tipo | Cuándo |
|---|---|---|---|
| `contratos/eventos/viajes/ViajeReasignado.v1.schema.json` | Evento nuevo (`viajeId`, `choferAnteriorId`, `choferNuevoId`, `tractoId`, `remolqueId`, `reasignadoPor`, `reasignadoEn`); consumen Flota y Analítica | Nuevo | **Solo si se incluye D13** (fuera del plan base) |
