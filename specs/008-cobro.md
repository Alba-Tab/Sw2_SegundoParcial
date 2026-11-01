# 008 · Registrar cobro

Estado: **revisado** · Casos de uso: CU-13 Registrar cobro (la propuesta 17 y la spec 004 sugerían CU-22 "Registrar pago", que duplicaría CU-13: se usa CU-13 y CU-22 queda libre; se anota para T12.4). CU-14 (línea de crédito) queda cubierto solo por la línea por defecto de 30.000,00 BOB (spec 001, D01) y su consulta en esta spec; cambiar el límite queda fuera de alcance · Responsable: Brayan Albaro Garcia Taboada

Administración registra a mano el pago de una factura (no hay pasarela, propuesta §2). Finanzas baja el saldo de la factura, abona la línea de crédito del cliente (el disponible sube) y publica `PagoRegistrado`. El cliente ve el saldo en el portal. Es el paso 10 del escenario. Decisiones: D04, D46, D48, D49. Propuesta 3.1 (`LineaCredito.abonar()`), 5.0 y 5.9.

## Actores y roles

| Actor | Rol | Qué hace |
|---|---|---|
| Administración | `administracion` | Registra el pago en cc-finanzas, con OCR del recibo como ayuda |
| Gerente | `gerente` | Ve facturas, pagos y cuentas por cobrar; no registra |
| Cliente | `cliente` | Ve sus facturas, saldos y crédito en el portal |
| Atención comercial | `comercial` | Ve las facturas de un cliente (con `clienteId`); no registra |
| Analítica | — | Consume `PagoRegistrado` (cuentas por cobrar, spec 015) |

## Precondiciones

- La factura existe y está `EMITIDA` o `PAGADA_PARCIAL` (spec 006).
- Administración tiene conexión: los pagos no se registran sin red (propuesta 6.6).

## Pasos (camino feliz)

1. Administración abre la factura en cc-finanzas (`factura(id)` por el Gateway → `GET /api/v1/facturas/{facturaId}`).
2. Opcional: sube la foto del recibo **en el navegador**; Tesseract.js (`spa`, servido desde el hosting propio, D38) propone `monto` y `referencia`. La imagen no sale del navegador (D70). La persona revisa y corrige.
3. Confirma. El Gateway (mutación `registrarPago`) intercambia el token y llama a `POST /api/v1/facturas/{facturaId}/pagos` con `{monto, fecha, medio, referencia, nota}` e `Idempotency-Key` (una clave por intento, generada al abrir el diálogo; viaja como argumento `claveIdempotencia` de la mutación, spec 016).
4. Finanzas, en **una transacción**:
   1. registra la clave en `operacion_idempotente` (`EN_PROCESO`);
   2. valida con el value object `Monto` (no negativo, 2 decimales) y las reglas de abajo;
   3. crea el `Pago`;
   4. `Factura.registrarPago(monto)`: `saldo` baja; estado `PAGADA_PARCIAL` (saldo > 0) o `PAGADA` (saldo = 0);
   5. `LineaCredito.abonar(monto)`: `utilizado` baja, con la fila bloqueada (`FOR UPDATE`);
   6. auditoría (`canal = CENTRO_CONTROL`, `actorSub`, factura, monto, referencia);
   7. `PagoRegistrado` en el Outbox con `saldoFactura` y `estadoFactura`;
   8. marca la clave `COMPLETADA` con la respuesta.
5. Responde `201` con la factura actualizada (incluye el pago y `Location: /api/v1/facturas/{facturaId}/pagos/{pagoId}`).
6. Analítica actualiza `hecho_factura` y `hecho_pago` (spec 013).
7. El cliente ve el nuevo saldo y el disponible en el portal (`GET /api/v1/facturas` y `GET /api/v1/lineas-credito/mia`), con MUI y TanStack Table/Query, *hooks* generados por Orval (D46, D48, D49).

## Reglas de negocio

| Regla | Valor |
|---|---|
| Quién registra | Solo `administracion`; otro rol → `403 SIN_PERMISO` |
| `monto` | Objeto `Monto` (000 §3), > 0,00 y ≤ `saldo` de la factura. Negativo o cero → `400 VALIDACION` (lo rechaza el value object, no el controlador). Mayor que el saldo → `422 PAGO_EXCEDE_SALDO` |
| `fecha` | `YYYY-MM-DD` en `America/La_Paz`, entre `emitidaEl` y hoy; si no, `400 VALIDACION` |
| `medio` | `TRANSFERENCIA`, `DEPOSITO`, `EFECTIVO` o `CHEQUE` (enum de `PagoRegistrado`) |
| `referencia` | 3 a 40 caracteres (número de operación, de depósito o de cheque); para `EFECTIVO`, el número del recibo interno |
| `nota` | Opcional, hasta 300 caracteres |
| Pagos parciales | Permitidos, sin mínimo; tantos como hagan falta hasta saldo 0 |
| Factura `PAGADA` | `409 CONFLICTO_ESTADO` |
| Idempotencia | **Autoridad: `operacion_idempotente`** (000 §4.1). Reenvío con la misma clave → la misma respuesta `201` |
| Referencia repetida | Índice único `pago(factura_id, medio, referencia)`: con **otra** clave, la misma factura y la misma referencia → `409 PAGO_DUPLICADO` (dos personas cargando el mismo depósito); el Problem Details trae la extensión `pagoId` del pago existente. Una misma transferencia que paga **dos facturas** se registra en cada una (no choca). La propuesta 4.3 ponía "un pago por referencia" como autoridad; queda como regla de negocio, porque 000 §4.1 manda para el reenvío |
| Línea de crédito | `abonar()`: `utilizado` − monto, nunca menor que 0. La fila de la línea se lee con `FOR UPDATE`: una operación concurrente espera a que termine la otra |
| Mora | Se recalcula al leer: `enMora` = alguna factura con `saldo > 0` vencida hace más de 7 días (D04). Pagar la factura vencida quita la mora para la próxima saga (spec 012) |
| Vencida | `vencida = saldo > 0 y hoy > venceEl`; `diasVencida` en la respuesta |
| Lo que ve el cliente | Solo sus facturas: en las listas el `clienteId` sale del token y **se ignora** el del parámetro (000 §8); `GET /facturas/{id}` o `/pagos` de una factura ajena → `403 SIN_PERMISO` |

### Línea de crédito (operaciones de la propuesta 5.0 que toca esta spec y la 006)

| Operación | Cuándo | Efecto |
|---|---|---|
| `consumir(monto)` | Factura emitida (spec 006) | `reservado` − monto, `utilizado` + monto |
| `abonar(monto)` | Pago registrado (esta spec) | `utilizado` − monto; `disponible = limite − reservado − utilizado` sube |

## Estados que cambia

| Entidad | Antes | Después |
|---|---|---|
| `Factura` | `EMITIDA` o `PAGADA_PARCIAL` | `PAGADA_PARCIAL` o `PAGADA` (máquina en la spec 006) |
| `Pago` | — | Registrado (sin estados: no hay anulación, propuesta §2) |
| `LineaCredito` | `utilizado` = U | `utilizado` = U − monto |

## Contratos que toca

- REST `contratos/openapi/finanzas.yaml` (nuevas): `registrarPago` (`POST /api/v1/facturas/{facturaId}/pagos`, `administracion`, `Idempotency-Key`; respuestas `201`, `400`, `401`, `403`, `404`, `409`, `422`, `503`), `listarPagos` (`GET /api/v1/facturas/{facturaId}/pagos`). Reusa `listarFacturas` y `obtenerFactura` (spec 006) y `obtenerMiLineaCredito` / `obtenerLineaCredito` (ya existen).
- Eventos: `PagoRegistrado.v1` (Analítica). Sin cambios.
- GraphQL (F9): `registrarPago(input: PagoInput!): Factura!` (propuesta 6.3), con `claveIdempotencia` dentro de `PagoInput` (spec 016).

## Errores y caminos alternativos

| Caso | Respuesta | En cc-finanzas |
|---|---|---|
| Monto negativo o cero (FF4) | `400 VALIDACION`, `errores[0].campo = "monto"` | "El monto debe ser mayor que 0" |
| Monto mayor que el saldo | `422 PAGO_EXCEDE_SALDO` | "El saldo es 1.000,00 BOB" |
| Factura ya pagada | `409 CONFLICTO_ESTADO` | Recarga la factura |
| Referencia ya registrada en esa factura | `409 PAGO_DUPLICADO` con `pagoId` | Muestra el pago existente |
| Misma clave, otro cuerpo | `422 IDEMPOTENCIA_CUERPO_DISTINTO` | — |
| Misma clave en curso | En la práctica no se ve: la clave se registra y se completa en la misma transacción, así que un reenvío simultáneo espera el commit sobre la llave de `operacion_idempotente` y recibe la respuesta guardada. `409 IDEMPOTENCIA_EN_PROCESO` queda solo como defensa | El botón queda deshabilitado mientras espera |
| Factura inexistente | `404 NO_ENCONTRADO` | — |
| Finanzas caída | El Gateway devuelve el error con `codigo = DEPENDENCIA_NO_DISPONIBLE` | "Finanzas no disponible; intenta de nuevo"; el pago no se guarda como borrador (6.6) |
| Sin conexión | No se envía | "Requiere conexión" |

## Criterios de aceptación

- **Dado** la factura del paso 6 del escenario (`FAC-…`, 2.800,00, `EMITIDA`) y `utilizado` = 2.800,00, **cuando** administración registra un pago de 2.800,00 por `TRANSFERENCIA` con referencia `BNB-778812`, **entonces** responde `201`, la factura queda `PAGADA` con saldo 0,00, `utilizado` baja 2.800,00, el disponible sube 2.800,00 y se publica `PagoRegistrado` con `estadoFactura = PAGADA`.
- **Dado** una factura de 2.800,00, **cuando** se pagan 1.000,00, **entonces** `PAGADA_PARCIAL` con saldo 1.800,00; **y cuando** se pagan 1.800,00 más, **entonces** `PAGADA`.
- **FF4 (pago negativo). Dado** un pago con `monto = "-100.00"`, **entonces** `400 VALIDACION` y nada cambia.
- **Dado** un saldo de 1.800,00, **cuando** se intenta pagar 2.000,00, **entonces** `422 PAGO_EXCEDE_SALDO`.
- **Dado** un pago registrado, **cuando** se reenvía con la misma clave y el mismo cuerpo, **entonces** la misma respuesta `201` y un solo pago; **y con** otra clave y la misma referencia en esa factura, `409 PAGO_DUPLICADO` con el `pagoId` existente; **y dado** una transferencia `BNB-900001` que paga dos facturas, **entonces** se registra en las dos.
- **Dado** "Agro Moroso" con su factura vencida hace 20 días, **cuando** se paga completa, **entonces** `enMora = false` y la próxima confirmación de La Paz con 20 t no pasa por el paso 2b (spec 012).
- **Dado** un usuario `gerente`, **cuando** intenta registrar un pago, **entonces** `403 SIN_PERMISO`.
- **FK1. Dado** el cliente A, **cuando** pide `GET /api/v1/facturas?clienteId=<B>`, **entonces** ve solo sus facturas (con rol `cliente` el parámetro se ignora, 000 §8); **y con** `GET /facturas/{id}` de B, `403 SIN_PERMISO`.

## Cómo se demuestra en la defensa

Paso 10 del escenario: en cc-finanzas, administración sube la foto del recibo, el OCR llena monto y referencia (la pestaña Red no muestra la imagen saliendo), confirma, y el portal del cliente muestra la factura `PAGADA` y el crédito disponible restaurado. FF4 (pago negativo) con curl.

## Cambios de contrato pendientes

| Contrato | Cambio | Tipo |
|---|---|---|
| `contratos/openapi/finanzas.yaml → registrarPago` | Respuesta `409` documentada con la extensión `pagoId` en el Problem Details (`comun.yaml → Problema` ya admite propiedades extra) | Compatible |
