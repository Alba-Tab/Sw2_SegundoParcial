# 002 · Cotizar servicio

Estado: **revisado** · Casos de uso: CU-01 Cotizar servicio · Responsable: Brayan Albaro Garcia Taboada

El cliente (o comercial a su nombre) pide precio para una ruta, un tipo de carga y un tonelaje. Finanzas calcula y guarda una cotización `VIGENTE` por 24 horas. No se reserva nada y nadie la aprueba a mano. Viajes es dueño de las rutas; Finanzas tiene una copia y las tarifas. Decisiones: D03, D05, D06, D10.

## Actores y roles

| Actor | Rol | Qué hace |
|---|---|---|
| Cliente | `cliente` | Consulta rutas y cotiza para sí mismo |
| Atención comercial | `comercial` | Cotiza a nombre de un cliente (`clienteId` por parámetro) |
| Administración | `administracion` | Ve todas las cotizaciones |
| Viajes | — | Publica `RutaActualizada` |
| Finanzas | — | Calcula y guarda la cotización |

## Precondiciones

- El cliente existe en Finanzas (copia creada por `ClienteActualizado`, spec 001).
- La ruta existe y está activa en Finanzas (copia creada por `RutaActualizada`) y tiene tarifa para el tipo de carga.
- Semilla de rutas en Viajes (Santa Cruz–Cochabamba, Santa Cruz–La Paz, Santa Cruz–Arica y Aula) con su destino, `radioMetros` y `distanciaKm` (D06), y semilla de tarifas en Finanzas (D10).

## Pasos (camino feliz)

1. El portal lista las rutas: `GET /api/v1/rutas` en Viajes (cualquier usuario autenticado).
2. El cliente elige ruta, tipo de carga, toneladas y fecha del viaje.
3. El portal hace `POST /api/v1/cotizaciones` en Finanzas con `Idempotency-Key`.
4. Finanzas valida, busca la tarifa de `(rutaId, tipoCarga)`, calcula `monto = tarifa × toneladas` con `Monto` (redondeo `HALF_UP` a 2 decimales) y guarda la `Cotizacion` en `VIGENTE` con `venceEn = ahora + vigencia`.
5. Responde `201` con la cotización: id, ruta, tipo de carga, toneladas, fecha, tarifa aplicada, monto, `venceEn` y estado.
6. El portal muestra el monto y una cuenta regresiva hasta `venceEn`, con el botón "Confirmar servicio" (spec 003).

## Reglas de negocio

| Regla | Valor |
|---|---|
| Tipos de carga | `GRANOS`, `INSUMOS`, `INSUMOS_LIQUIDOS`, `CONTENEDOR` |
| Tarifa (BOB por tonelada) | Base por ruta × factor por carga, guardada ya multiplicada. Base: Cochabamba 250, La Paz 380, Arica 650, Aula 100. Factor: `GRANOS` 1,00, `INSUMOS` 1,10, `INSUMOS_LIQUIDOS` 1,25, `CONTENEDOR` 1,20 |
| Toneladas | Mayor que 0 y como máximo **30** por servicio (D03); más da `422 TONELAJE_EXCEDIDO` |
| Fecha del viaje | Hoy o posterior (en `America/La_Paz`) y como máximo 60 días adelante |
| Vigencia | `PT24H`. Es configuración de la API de Finanzas (`COTIZACION_VIGENCIA`); en demo, `PT2M` |
| Vencida | `VENCIDA` no se guarda: la respuesta trae el booleano `vencida`, calculado como `estado = VIGENTE` y `ahora > venceEn`. `estado` solo toma `VIGENTE` o `ACEPTADA` |
| Propiedad | Con rol `cliente`, el `clienteId` sale del token y se ignora el del cuerpo. Con `comercial`, sale del cuerpo y se registra `canal = TELEFONO` |
| Reserva | Cotizar no reserva crédito ni unidades |

**Montos de referencia** (se usan en los fallos de la spec 003):

| Ruta y carga | Toneladas | Monto (BOB) |
|---|---|---|
| Aula, `GRANOS` | 28 | 2.800,00 |
| Cochabamba, `INSUMOS_LIQUIDOS` | 20 | 6.250,00 |
| La Paz, `GRANOS` | 20 | 7.600,00 |
| La Paz, `GRANOS` | 28 | 10.640,00 |
| Arica, `GRANOS` | 28 | 18.200,00 (monto alto: más de 15.000) |

## Estados que cambia

| Entidad | Estados |
|---|---|
| `Cotizacion` (Finanzas) | — → `VIGENTE`. Después: `ACEPTADA` en el paso 2 de la saga; vuelve a `VIGENTE` si la saga compensa y sigue en plazo; `VENCIDA` se calcula |
| Copia de `Ruta` (Finanzas) | Se crea o actualiza con `RutaActualizada` (descarta versiones viejas) |

## Contratos que toca

- REST: `contratos/openapi/viajes.yaml` → `listarRutas`, `obtenerRuta`; `contratos/openapi/finanzas.yaml` → `crearCotizacion`, `obtenerCotizacion`, `listarCotizaciones`.
- Eventos: `RutaActualizada.v1` (Viajes → Finanzas y Analítica).

## Errores y caminos alternativos

| Caso | Respuesta |
|---|---|
| Ruta inexistente o inactiva | `404 NO_ENCONTRADO` |
| Ruta sin tarifa para ese tipo de carga | `400 VALIDACION` con el campo `tipoCarga` |
| Más de 30 t | `422 TONELAJE_EXCEDIDO` |
| Fecha pasada o a más de 60 días | `400 VALIDACION` |
| Cliente aún no replicado en Finanzas (acaba de registrarse) | `503 CLIENTE_NO_REPLICADO` con `Retry-After: 2`; el portal reintenta solo |
| `cliente` pide la cotización de otro cliente | `403 SIN_PERMISO` |
| Reenvío con la misma clave | Respuesta guardada |

## Criterios de aceptación

- **Dado** el cliente de semilla, **cuando** cotiza La Paz con 20 t de `GRANOS`, **entonces** recibe `201` con `monto = {"monto":"7600.00","moneda":"BOB"}`, estado `VIGENTE` y `venceEn` 24 h después.
- **Dado** 31 t, **cuando** cotiza, **entonces** recibe `422 TONELAJE_EXCEDIDO`.
- **Dado** `COTIZACION_VIGENCIA=PT2M`, **cuando** pasan más de 2 minutos, **entonces** `GET /cotizaciones/{id}` muestra `vencida: true` y el paso 2 de la saga la rechaza (spec 003, FS1).
- **Dado** un cliente con rol `cliente`, **cuando** envía otro `clienteId` en el cuerpo, **entonces** la cotización queda a su propio nombre.
- **Dado** un `RutaActualizada` con `versionAgregado` 3 ya aplicado, **cuando** llega uno con versión 2, **entonces** Finanzas lo descarta.

## Cómo se demuestra en la defensa

Paso 2 del escenario: el cliente cotiza el Aula con 28 t de granos (2.800,00 BOB) y se ve la cuenta regresiva. Con la vigencia de demo (`PT2M`) se prepara FS1.
