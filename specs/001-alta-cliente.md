# 001 · Alta de cliente

Estado: **revisado** · Casos de uso: CU-03 Crear cuenta de cliente (nuevo) · Responsable: Brayan Albaro Garcia Taboada

Un cliente nuevo se registra en el portal y completa los datos de su empresa; atención comercial también puede registrar un cliente que no tiene cuenta. Viajes es el dueño del `Cliente` y el único que escribe `clienteId` en Keycloak. Decisiones: D01, D02, D12, D26 ([decisiones.md](decisiones.md)).

## Actores y roles

| Actor | Rol en el token | Qué hace |
|---|---|---|
| Usuario nuevo | Ninguno (usuario autenticado sin roles) | Se registra y completa los datos de su empresa |
| Atención comercial | `comercial` | Registra un cliente sin cuenta para pedir servicios a su nombre |
| Viajes | Cuenta de servicio `viajes` | Crea el cliente, escribe `clienteId` y asigna el rol `cliente` en Keycloak |
| Finanzas | — (consumidor de eventos) | Crea su copia del cliente y la línea de crédito por defecto |

## Precondiciones

- Realm `transporte` con registro habilitado en el cliente `portal-cliente`, sin verificación de correo (D26) y sin roles por defecto (K3).
- Atributo `clienteId` declarado en el perfil de usuario: editable y visible solo para administradores, con su mapper en un client scope.
- La cuenta de servicio de `viajes` tiene permiso (FGAP v2) para escribir `clienteId` y asignar el rol `cliente` solo a usuarios del grupo `registro-portal` (K4).

## Pasos (camino feliz, con cuenta)

1. El usuario elige "Crear cuenta" en el portal; Keycloak muestra su formulario de registro y crea el usuario **sin roles**, dentro del grupo por defecto `registro-portal`.
2. El portal recibe un token sin `clienteId` y muestra "Completa los datos de tu empresa": razón social, NIT, correo de facturación, teléfono y dirección.
3. El portal hace `POST /api/v1/clientes` con `Idempotency-Key`. El endpoint solo exige un usuario autenticado.
4. Viajes, en **una transacción**: crea el `Cliente` con el `sub` del usuario, `canal = PORTAL`, `versionAgregado = 1` y `vinculado = false`; deja `ClienteActualizado` en el Outbox; y guarda la operación en `operacion_idempotente` ya **`COMPLETADA`**, con la respuesta `201` y `vinculado: false`. Así un reenvío nunca queda bloqueado en `EN_PROCESO`, aunque Viajes caiga antes de responder.
5. Después del commit, Viajes llama a la API de administración de Keycloak: escribe el atributo `clienteId` y asigna el rol `cliente`. Marca el cliente `vinculado = true`.
6. Viajes responde `201` con el cliente y el `vinculado` real (`true` si el paso 5 salió bien). Un reenvío con la misma clave recibe la respuesta guardada (`vinculado: false`); el portal siempre lee el estado real con `GET /api/v1/clientes/mio`.
7. El portal renueva el token, que ya trae `clienteId` y el rol `cliente`.
8. Finanzas consume `ClienteActualizado` (Inbox): crea su copia y, si es el **primer** evento de ese cliente, una `LineaCredito` con límite **30.000,00 BOB** (D01).

## Pasos (comercial, sin cuenta)

1. Atención comercial completa los mismos datos en el portal en modo comercial.
2. `POST /api/v1/clientes` con rol `comercial`: Viajes crea el cliente sin `sub`, con `canal = TELEFONO`, `creadoPor = <sub del comercial>`, y publica `ClienteActualizado`. No hay paso de Keycloak.
3. Desde ese momento, comercial pide servicios a nombre de ese cliente (`clienteId` por parámetro, 000 §8).

## Reglas de negocio

| Regla | Valor |
|---|---|
| Un usuario, un cliente | Si el `sub` ya tiene cliente, `POST /clientes` con otra clave responde `409 CONFLICTO_ESTADO` con el `clienteId` existente |
| NIT | Texto de 5 a 20 dígitos; no se valida contra el SIN (fuera de alcance). Único entre clientes activos: un NIT repetido da `409 CONFLICTO_ESTADO` |
| Correo de facturación | Obligatorio; es al que n8n envía los avisos |
| Razón social | 3 a 120 caracteres |
| Auditoría | `creadoPor` y `canal` (`PORTAL` o `TELEFONO`) en la tabla `auditoria` de Viajes |
| Línea por defecto | 30.000,00 BOB, creada por Finanzas solo con el primer `ClienteActualizado` (los siguientes actualizan la copia, no la línea) |
| Orden de copias | Finanzas y Analítica descartan un `ClienteActualizado` con `versionAgregado` menor o igual al que ya tienen |

## Estados que cambia

| Entidad | Antes | Después |
|---|---|---|
| Usuario de Keycloak | Sin roles, sin `clienteId` | Rol `cliente` y `clienteId` |
| `Cliente` (Viajes) | — | Creado; `vinculado` = `false` hasta el paso 5, luego `true` |
| Copia del cliente y `LineaCredito` (Finanzas) | — | Creadas; línea con `limite` 30.000, `reservado` 0, `utilizado` 0 |

## Contratos que toca

- REST: `contratos/openapi/viajes.yaml` → `crearCliente`, `obtenerMiCliente`, `reintentarVinculacion`, `obtenerCliente`.
- Eventos: `ClienteActualizado.v1`.
- Keycloak: perfil de usuario con `clienteId`, grupo `registro-portal`, permisos FGAP v2 (`plataforma/keycloak/`, T2.2).

## Errores y caminos alternativos

| Caso | Respuesta | Qué hace el portal |
|---|---|---|
| Falla Keycloak en el paso 5 | El cliente queda creado con `vinculado = false`; `201` con `vinculado: false` y aviso | Muestra "Reintentar vinculación" → `POST /api/v1/clientes/mio/vinculacion` con `Idempotency-Key`, que repite **solo** el paso 5 (escribir el atributo y asignar el rol son idempotentes) |
| Reintentar vinculación y Keycloak sigue caído | `503 VINCULACION_PENDIENTE` con `Retry-After` | Mantiene el botón |
| Reenvío con la misma clave | La respuesta guardada (000 §4.1) | — |
| Misma clave, otro cuerpo | `422 IDEMPOTENCIA_CUERPO_DISTINTO` | — |
| Datos inválidos | `400 VALIDACION` con `errores` por campo | Marca los campos |
| Token con rol `chofer` u otro rol interno sin `comercial` | `403 SIN_PERMISO` | — |
| Cliente con rol `cliente` pide `GET /api/v1/clientes/{otroId}` | `403 SIN_PERMISO` | — |

## Criterios de aceptación

- **Dado** un usuario recién registrado sin roles, **cuando** envía sus datos con una clave nueva, **entonces** recibe `201`, el siguiente token trae `clienteId` y rol `cliente`, y Finanzas tiene una línea de 30.000,00 BOB para ese cliente.
- **Dado** que Keycloak no responde, **cuando** el usuario envía sus datos, **entonces** el cliente queda creado con `vinculado: false`; **y cuando** Keycloak vuelve y pulsa "Reintentar vinculación", **entonces** el token trae `clienteId` sin crear un segundo cliente.
- **Dado** un `POST /clientes` exitoso, **cuando** se reenvía con la misma clave y el mismo cuerpo, **entonces** responde lo mismo y existe un solo cliente.
- **Dado** un usuario con cliente, **cuando** hace `POST /clientes` con otra clave, **entonces** recibe `409 CONFLICTO_ESTADO`.
- **Dado** un usuario `comercial`, **cuando** registra un cliente sin cuenta, **entonces** el cliente queda con `canal = TELEFONO` y `creadoPor` del comercial, y no se toca Keycloak.
- **Dado** que Finanzas recibe dos veces el mismo `ClienteActualizado` (mismo `eventId`), **entonces** hay una sola línea de crédito.

## Cómo se demuestra en la defensa

Paso 1 del escenario de punta a punta: registro en vivo en el portal y, en las herramientas de desarrollo, el token antes (sin `clienteId`) y después de completar los datos. Para el camino de error, detener Keycloak un momento antes de enviar y mostrar "Reintentar vinculación".
