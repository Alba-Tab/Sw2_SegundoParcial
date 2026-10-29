# 009 · Combustible: cargas y sensor

Estado: **revisado** · Casos de uso: CU-11 Registrar carga de combustible (más el sensor simulado por MQTT) · Responsable: Brayan Albaro Garcia Taboada

Dos fuentes de datos del diésel, las dos en Flota. **Cargas:** el chofer registra en la app la foto del recibo, litros, monto y kilometraje; Flota las guarda con `opId` único y publica `CargaCombustibleRegistrada`. **Sensor:** un simulador publica el nivel del tanque por MQTT; Flota lo consume por AMQP y, si el nivel cae 8 % o más en 10 min con el camión detenido, publica `CaidaCombustibleDetectada` (posible robo). Las anomalías de rendimiento (Isolation Forest) y las alertas son de Analítica (spec 013). Requisito 9 (sensores). Decisiones: D08, D30, D38, D39, D40. Propuesta 4.3 y 5.11.

## Actores y roles

| Actor | Rol | Qué hace |
|---|---|---|
| Chofer | `chofer` | Registra la carga desde su viaje (app, funciona sin red) |
| Jefe de flota | `jefe_flota` | Ve cargas, lecturas y alertas de combustible en cc-flota |
| Gerente, despachador | `gerente`, `despachador` | Lectura |
| Simulador de combustible | Usuario MQTT `sensor-sim` (no es de Keycloak) | Publica una lectura cada 10 s por camión (T5.4) |
| Worker de Flota | — | Consume `flota.sensor`, guarda lecturas y detecta caídas |
| Analítica | — | Consume los dos eventos (spec 013) |

## Precondiciones

- El tracto tiene en `atributos` su `capacidadTanqueLitros` (spec 010; semilla: 600 L).
- Para una carga: existe la reserva de unidad del `viajeId` y su chofer es el del token (specs 003 y 005).
- Para el sensor: RabbitMQ con el plugin `mqtt`; la cola `flota.sensor` enlazada a `amq.topic` con la clave `camion.*.combustible` (README de eventos).

## Pasos (camino feliz)

**A. Carga (CU-11)**

1. En la gasolinera, el chofer toma la foto del recibo y llena litros, monto y kilometraje del odómetro. La app crea la operación `CARGA_COMBUSTIBLE` en la cola local con su `opId` (spec 005).
2. La foto sube por partes como evidencia `RECIBO_COMBUSTIBLE` del viaje en Viajes (spec 006, pasos 1 a 3; D40). Flota solo guarda su `evidenciaId` en `fotoReciboEvidenciaId`, **sin validarlo** (Flota solo valida tokens, propuesta 7.1; no llama a Viajes). La app envía la carga después de completar la evidencia (spec 005); si la foto se pierde, cc-flota muestra "Foto no disponible".
3. `POST /api/v1/cargas-combustible` en Flota con `{opId, viajeId, litros, monto, kilometraje, registradaEn, posicion, fotoReciboEvidenciaId}` e `Idempotency-Key = opId`.
4. Flota busca la reserva de unidad del `viajeId` (`CONFIRMADA` o `LIBERADA`), verifica que su chofer sea el del token y toma `tractoId`, `placa` y `choferId`.
5. En una transacción de Mongo (*replica set*): inserta en `cargasCombustible` (índice único `opId`, con el hash del cuerpo), actualiza el `kilometraje` (odómetro) del tracto con el informado y deja `CargaCombustibleRegistrada` en su Outbox. Responde `201` con la carga.
6. Analítica calcula km por litro y el puntaje de anomalía (spec 013).

**B. Sensor**

7. El simulador (`plataforma/simulador-combustible`) publica cada **10 s** en el tema MQTT `camion/{placa}/combustible` un `LecturaSensorCombustible` (`placa`, `nivelPct`, `capacidadLitros`, `velocidadKmh`, `medidoEn`). En local por `mqtt://` (1883); hacia la EC2 por **`mqtts://` con la CA propia** (8883).
8. RabbitMQ lo deja en `amq.topic` con la clave `camion.{placa}.combustible`; Flota lo consume por **AMQP** desde `flota.sensor` (D30; Flota no tiene cliente MQTT).
9. Flota valida el esquema, guarda la lectura en `lecturasCombustible` y aplica la regla de caída.
10. Si detecta una caída: en una transacción guarda la `deteccion` y deja `CaidaCombustibleDetectada` en el Outbox con `nivelAnteriorPct`, `nivelActualPct`, `caidaPct`, `ventanaMinutos`, `velocidadKmh` y el `viajeId` si el tracto está `EN_VIAJE`.
11. Analítica crea la alerta `CAIDA_COMBUSTIBLE` (spec 013).

## Reglas de negocio

**Cargas**

| Regla | Valor |
|---|---|
| Quién | Solo `chofer`, y solo sobre la reserva de su viaje; otro → `403 SIN_PERMISO`; reserva inexistente → `404 NO_ENCONTRADO` |
| Viaje terminado | Se acepta aunque la reserva ya esté `LIBERADA` (la carga llegó tarde por falta de señal) |
| `litros` | > 0 y ≤ `capacidadTanqueLitros` del tracto; si no, `422 CARGA_EXCEDE_TANQUE` |
| `monto` | `Monto` > 0,00; si no, `400 VALIDACION` |
| `kilometraje` | Odómetro del tracto (spec 010: solo los tractos tienen `kilometraje`). Debe ser ≥ el `kilometraje` actual del tracto, que nunca baja; si es menor, `422 KILOMETRAJE_INVALIDO`. Se guarda el informado |
| `registradaEn` | ≤ ahora + 2 min |
| Foto | Opcional (D71). Flota guarda `fotoReciboEvidenciaId` tal como llega, sin consultar a Viajes |
| Idempotencia | Autoridad: índice único `opId` en `cargasCombustible` (propuesta 4.3; 000 §4.1). `Idempotency-Key` debe ser igual a `opId` (si no, `400 VALIDACION`). Reenvío con el mismo cuerpo → `201` con el documento existente (el mismo código que la primera vez, 000 §4.1); con otro cuerpo → `422 IDEMPOTENCIA_CUERPO_DISTINTO` |
| Carga exagerada | No se rechaza si cabe en el tanque: la marca el modelo de anomalías (FF2, spec 013) |

**Sensor**

| Regla | Valor |
|---|---|
| Frecuencia | Una lectura cada 10 s por camión (D08) |
| Esquema | `LecturaSensorCombustible.v1`, sin sobre. Inválida → se descarta a `flota.sensor.dlq` |
| Duplicados | Índice único `(placa, medidoEn)`: una lectura repetida se ignora |
| Placa desconocida | Se descarta con un log de advertencia |
| Retención | Índice TTL de 30 días sobre `medidoEn` (D72) |
| **Caída** | Con `velocidadKmh = 0` en la lectura actual: `referencia` = el mayor `nivelPct` de las lecturas de los últimos **10 min** con velocidad 0 y posteriores a la última lectura con velocidad > 0. Si `referencia − nivelActual ≥ 8,0` puntos de la capacidad (D08) → detección. `ventanaMinutos` = minutos entre la lectura de referencia y la actual |
| Una por parada | Una detección por episodio de parada: no se publica otra hasta que la placa vuelva a moverse (velocidad > 0) |
| Carga en marcha | Una subida de nivel no dispara nada |
| Escenarios del simulador | `normal`: baja 0,05 puntos por lectura en marcha y queda estable detenido. `robo`: velocidad 0 y baja 2 puntos por lectura durante 60 s (12 puntos, detección a los 40 s) |
| Seguridad | El usuario MQTT `sensor-sim` solo puede publicar en `camion.*.combustible` (permisos de tema de RabbitMQ, D73). El simulador de viaje (T8.7), que sí llama a la API, usa `demo-cli` con *device grant* en la nube (D39) |

## Estados que cambia

| Entidad | Cambio |
|---|---|
| `CargaCombustible` (Flota) | Se crea; no tiene estados |
| Tracto (Flota) | `kilometraje` (odómetro); el estado de la unidad no cambia |
| `LecturaCombustible` y `DeteccionCaida` (Flota) | Se crean |

## Contratos que toca

- REST `contratos/openapi/flota.yaml` (nuevas): `registrarCargaCombustible` (`POST /api/v1/cargas-combustible`, `chofer`, `Idempotency-Key`; `201` (también en el reenvío), `400`, `401`, `403`, `404`, `422`, `503`), `listarCargasCombustible` (`GET /api/v1/cargas-combustible?tractoId&desde&hasta&cursor`, `jefe_flota`, `gerente`, `despachador`; `chofer` solo las suyas), `listarLecturasCombustible` (`GET /api/v1/unidades/{unidadId}/lecturas-combustible?desde&hasta`, `jefe_flota`, `gerente`; máximo 24 h por consulta).
- REST `contratos/openapi/viajes.yaml`: evidencias de la spec 006 con `tipo = RECIBO_COMBUSTIBLE`.
- Eventos: `CargaCombustibleRegistrada.v1`, `CaidaCombustibleDetectada.v1` (Analítica); mensaje MQTT `LecturaSensorCombustible.v1`. Sin cambios.
- GraphQL (F9): `cargasCombustible(filtro)`, `lecturasCombustible(unidadId, desde)`.

## Errores y caminos alternativos

| Caso | Respuesta |
|---|---|
| Carga sin señal | Queda en la cola local y se envía al volver (spec 005); una sola carga por `opId` |
| Litros mayores que el tanque | `422 CARGA_EXCEDE_TANQUE` |
| Kilometraje menor que la carga anterior | `422 KILOMETRAJE_INVALIDO` |
| MongoDB caído | `503 DEPENDENCIA_NO_DISPONIBLE` con `Retry-After`; la app reintenta |
| Worker de Flota detenido | Las lecturas se acumulan en `flota.sensor` (cola quorum) y se procesan al volver; la detección usa `medidoEn`, no la hora de llegada |
| Broker caído | El simulador reintenta la conexión cada 5 s (D74); se pierden las lecturas de ese lapso (es un sensor, no una operación) |

## Criterios de aceptación

- **Paso 4. Dado** chofer1 en el viaje del Aula con el tracto `4521KTR` (`kilometraje` de semilla 184.000, sin cargas previas), **cuando** registra 180,5 L por 675,07 BOB con 184.320 km, **entonces** responde `201`, hay una carga en `cargasCombustible` y se publica `CargaCombustibleRegistrada` con su `opId`.
- **Dado** esa carga registrada sin señal, **cuando** la app la reenvía dos veces al sincronizar, **entonces** hay un solo documento y un solo evento (FO1).
- **Dado** el mismo `opId` con otros litros, **entonces** `422 IDEMPOTENCIA_CUERPO_DISTINTO`.
- **Dado** una carga con `kilometraje` 184.100 después de la de 184.320, **entonces** `422 KILOMETRAJE_INVALIDO`.
- **Dado** un tanque de 600 L, **cuando** se registran 650 L, **entonces** `422 CARGA_EXCEDE_TANQUE`.
- **FF1 (evento, H5). Dado** el simulador en escenario `robo` para `4521KTR`, **cuando** pasan 60 s, **entonces** Flota publica **un** `CaidaCombustibleDetectada` con `caidaPct ≥ 8` y `velocidadKmh = 0`, visible en `analitica.eventos`; **y en** H8 aparece la alerta `CAIDA_COMBUSTIBLE` (spec 013) y en H9 en cc-flota.
- **Dado** el escenario `normal`, **cuando** pasan 30 min, **entonces** no hay detecciones.
- **Dado** una caída de 6 puntos en 10 min detenido, **entonces** no hay detección; **y dado** una caída de 10 puntos en marcha, **entonces** tampoco.
- **Dado** un mensaje en `camion.4521KTR.combustible` sin `nivelPct`, **entonces** termina en `flota.sensor.dlq`.
- **FF2 (parte de Flota). Dado** la carga del paso 4 de `4521KTR` en 184.320 km, **cuando** se registra la de FF2 de 450 L con 184.440 km (la anterior + 120; cabe en el tanque), **entonces** Flota la acepta con `201`; la anomalía la marca Analítica (spec 013).

## Cómo se demuestra en la defensa

Paso 4 del escenario: el simulador corre con `mqtts://` hacia la EC2; en cc-flota se ve la curva del tanque. Se cambia a `robo` y aparece la alerta de posible robo (FF1). Paso 7: el chofer registra una carga exagerada desde la app y aparece la anomalía (FF2, spec 013).
