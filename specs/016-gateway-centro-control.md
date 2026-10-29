# 016 · Gateway GraphQL, sesión y Centro de Control

Estado: **revisado** · Casos de uso: CU-19 Iniciar sesión, CU-21 Cerrar sesión, y la composición del Gateway que usan las 4 apps del Centro de Control · Responsable: Brayan Albaro Garcia Taboada

Las 4 apps Angular (`cc-tablero`, `cc-operaciones`, `cc-flota`, `cc-finanzas`) son independientes y comparten el login de Keycloak: el SSO hace que pasar de una a otra no pida contraseña. Todas hablan solo con el Gateway GraphQL, que intercambia el token del usuario por uno de cada servicio, compone la respuesta y, si un servicio cae, devuelve ese dato vacío con su error (respuesta parcial). Requisitos 1, 3, 5 y 6. Decisiones: D21, D23, D27, D28, D46, D49. Propuesta 4.2, 6.1–6.3, 7.1–7.7.

## Actores y roles

| Actor | Rol | Qué hace |
|---|---|---|
| Usuario interno | `gerente`, `despachador`, `jefe_flota`, `administracion`, `comercial` | Inicia y cierra sesión; usa las apps de su rol |
| Cliente, chofer | `cliente`, `chofer` | No tienen acceso al Centro de Control |
| Keycloak (realm `transporte`) | — | Login, sesión SSO, tokens e intercambio (RFC 8693) |
| `ui-comun` | — | OIDC compartido, interceptor, barra con disponibilidad, campana (spec 013) |
| Gateway (NestJS) | cliente confidencial `gateway` | Esquema GraphQL, intercambio de tokens, composición, permisos por campo, suscripción, descarga de Excel (spec 015) |
| Viajes, Flota, Finanzas, Analítica | — | Dueños de los datos; vuelven a validar permisos y filas (cuarta capa, propuesta 7.5) |

## Precondiciones

- Clientes de Keycloak de la propuesta 7.1: uno público con PKCE por app, con audiencia `gateway` y su URL de cierre de sesión.
- Tokens (D27): *access token* de 5 min (demo 2 min), `refresh_token` sin iframe, sesión de 30 min inactiva y 10 h como máximo; en la web el token vive **en memoria**.
- `CORS_ORIGENES` del Gateway con los 5 orígenes de las apps.

## Pasos

**A. Iniciar sesión (CU-19)**

1. El usuario abre `cc-tablero` (puerta de entrada para todos). `ui-comun` redirige a Keycloak con *Authorization Code* + PKCE; el usuario inicia sesión.
2. Con el token, `cc-tablero` redirige según el rol (propuesta 6.1):

| Rol | Destino |
|---|---|
| `gerente` | Se queda en `cc-tablero` |
| `despachador` | `cc-operaciones` |
| `jefe_flota` | `cc-flota` |
| `administracion` | `cc-finanzas` |
| `comercial` | `cc-operaciones` en lectura, con "Ver como cliente" |
| `cliente` | Mensaje con enlace al portal |
| `chofer` | "Tu cuenta no tiene acceso" |

3. **Salto de SSO:** al abrir otra app desde la barra, su cliente OIDC va a Keycloak y vuelve de inmediato sin pedir contraseña, porque la sesión ya existe (en la pestaña Red se ve la ida y la vuelta).
4. **"Ver como cliente"** (`comercial`): abre el portal en modo comercial en `/comercial/clientes/{clienteId}`; el portal entra por SSO sin contraseña y muestra el aviso fijo con el cliente y el usuario que registra (propuesta 6.4).
5. **Renovación:** `ui-comun` renueva el token con el `refresh_token` 30 s antes de que venza y **al volver a la pestaña** (`visibilitychange`).

**B. Consultas y composición**

6. Cada app manda sus consultas al Gateway con `Authorization: Bearer` (audiencia `gateway`). El Gateway valida firma, `aud` y vencimiento.
7. Por cada servicio que necesita, intercambia el token por uno a nombre del mismo usuario con la audiencia del servicio (`libs/intercambio-token`), con caché por `sub` y audiencia hasta 30 s antes de su vencimiento.
8. **DataLoader** por petición: junta las claves iguales de un mismo tipo (por ejemplo, el `clienteId` de 20 viajes) y las pide una vez; si el servicio ofrece un filtro por ids, en una sola llamada, y si no, en paralelo con un máximo de 10 a la vez (D97).
9. Cada llamada a un servicio **para componer una pantalla** (consultas) tiene un tiempo de espera de **3 s** (D98). Excepciones, por operación: `preguntar` **60 s** (dos turnos del LLM de 20 s más el MCP); `exportarReporte` **30 s** (hasta 10.000 filas, D93); en el plan B de voz (spec 015), cada llamada a `/voz/interpretaciones`, a `ejecutar_reporte` del MCP y a `/voz/redacciones` **25 s**. Las mutaciones simples usan 10 s. El tiempo de espera de las peticiones del servicio Gateway en Cloud Run es de 3.600 s, mayor que todos estos y el que ya necesita la suscripción. Si un servicio no responde o devuelve `5xx`, los campos que dependen de él salen en `null` y la respuesta trae un error en `errors[]` con su `path` y `extensions.codigo = DEPENDENCIA_NO_DISPONIBLE`; **el resto de la respuesta sale igual** (respuesta parcial, propuesta 4.2).
10. Ejemplo: `tablero(periodo)` compone viajes en curso (Viajes), saldos y facturas por vencer (Finanzas), unidades por estado (Flota) y alertas abiertas (Analítica). Los reportes que unen servicios vienen del modelo de lectura con "datos al hh:mm" (spec 015).

**C. Mutaciones**

11. Toda mutación de negocio recibe el argumento **`claveIdempotencia: ID!`** (en `input` cuando la mutación usa uno). La app genera un UUID **por intento** (al abrir el diálogo o en cada clic de "Confirmar"); el Gateway no guarda nada y lo reenvía como `Idempotency-Key` al servicio dueño, que es la autoridad (000 §4.1). Mutaciones con clave: `cancelarServicio`, `aprobarCredito`, `resolverIntervencion`, `aprobarEntregaObservada`, `rechazarEntregaObservada`, `programarMantenimiento`, `cerrarMantenimiento`, `registrarPago`, `atenderAlerta`, `dispararMision`, `aprobarAccion`, `rechazarAccion` y `exportarReporte`. `preguntar` no lleva clave porque no cambia estado (spec 015).
12. Los errores del servicio llegan en `errors[].extensions` con `codigo` y `status` de 000 §5; la app decide por `codigo`.

**D. Suscripción de alertas**

13. `subscription alertas` por WebSocket (`graphql-transport-ws`). El token va en el `payload` de `connection_init` (`{authorization: "Bearer …"}`), nunca en la URL. Token inválido → cierre `4401`; rol sin alertas (`cliente`, `chofer`) → cierre `4403` (D77).
14. Mientras está abierta, el Gateway consulta a Analítica cada 3 s con el último cursor (spec 013) y emite cada alerta nueva. Cierra con `4401` cuando vence el token y a los 3.600 s (límite de Cloud Run).
15. `ui-comun` reconecta con espera creciente (1, 2, 4… s, máximo 30 s, D99), con un token renovado, y primero pide `alertasPendientes(desde: <último cursor>)` para no perder alertas.

**E. Barra y disponibilidad**

16. La barra de `ui-comun` muestra solo los enlaces a las apps que el rol permite. Cada 60 s (D100) pide `GET /salud.json` (archivo estático del hosting) de cada app enlazada; si falla, la marca "no disponible" y el enlace queda deshabilitado. Las demás apps siguen funcionando (FR3).

**F. Cerrar sesión (CU-21)**

17. "Cerrar sesión" en cualquier app llama al `end_session_endpoint` de Keycloak con `id_token_hint` y `post_logout_redirect_uri`; la sesión SSO termina.
18. Las otras apps abiertas lo detectan **al renovar el token** (`invalid_grant`): al volver a la pestaña o a más tardar cuando vence el *access token* (5 min; 2 min en demo). Entonces borran el token de memoria y piden login. El cierre *front-channel* (iframes) queda como mejora (recorte de nivel 1), porque los navegadores bloquean las cookies de terceros.

## Reglas de negocio

| Regla | Valor |
|---|---|
| Cuatro capas (propuesta 7.5) | Token (roles y `clienteId`), menú de la app (comodidad), Gateway (permisos por campo) y servicio dueño (filas; responde `403`) |
| Permisos por campo | Directiva `@roles` en el esquema. `despachador` y `jefe_flota` no ven finanzas (propuesta 7.2): `Viaje.monto`, `Factura`, `LineaCredito` y `cuentasPorCobrar` salen en `null` con un error `SIN_PERMISO` en su `path`. `comercial` ve todo en lectura y no tiene mutaciones salvo `cancelarServicio` |
| Límites | Profundidad máxima 8 y complejidad máxima 1.000 (cada campo vale 1 y una lista multiplica por su `limite`, máximo 100) (D101); si se pasa → error `CONSULTA_DEMASIADO_COMPLEJA` antes de llamar a ningún servicio. Introspección apagada en la nube |
| Respuesta parcial | Un servicio caído nunca tumba la consulta entera: `null` en sus campos + error con `path`; el Gateway responde `200` |
| Sin token | `401` (HTTP) en `POST /graphql`; las apps redirigen al login |
| Cliente en el Centro de Control | La app muestra "Sin acceso"; el Gateway responde `403 SIN_PERMISO` a cualquier consulta con rol `cliente` o `chofer` |
| Datos de otro cliente | El servicio dueño responde `403 SIN_PERMISO` (000 §4); el Gateway lo pasa como error del campo |
| Consolas operativas (D28) | La Temporal UI (8233) y la consola de RabbitMQ (15672) no forman parte del Centro de Control ni pasan por el Gateway: solo por `tunel-consolas.sh` (SSM); el grupo de seguridad de la EC2 no abre esos puertos |
| Trazas (D23) | El Gateway crea el *span* raíz de cada operación GraphQL y propaga `traceparent` y `X-Correlation-Id` a cada servicio |
| Interfaz | Angular Material con el tema de los tokens de diseño (D46, D47); servicios tipados de Apollo Angular generados con GraphQL Code Generator (D49) |

## Estados que cambia

| Entidad | Cambio |
|---|---|
| Sesión SSO (Keycloak) | Se crea al iniciar sesión; termina al cerrarla, a los 30 min sin actividad o a las 10 h |
| Tokens en memoria (cada app) | Se renuevan; se borran al detectar el cierre |
| Datos de negocio | Ninguno propio: el Gateway no tiene base; las mutaciones cambian estado en el servicio dueño |

## Contratos que toca

- GraphQL `contratos/graphql/centro-control.graphql` (T9.1): consultas de las pantallas (`tablero`, `viajesEnCurso`, `entregasObservadas`, `unidades`, `facturas`, `reporte`, `alertasPendientes`, `misionesAgente`, `accionesPropuestas`…), las mutaciones de la sección C con `claveIdempotencia: ID!`, y `subscription alertas`. Directiva `@roles`.
- REST `contratos/openapi/gateway.yaml` (nuevo): `POST /graphql`, `GET /exportaciones/{token}` (spec 015), `GET /health` y `GET /health/ready`.
- Keycloak: realm `transporte` con los clientes de la propuesta 7.1 (keycloak-config-cli).
- REST que compone: los `GET` de `viajes.yaml`, `flota.yaml`, `finanzas.yaml` y `analitica.yaml` de las specs 003–015.

## Errores y caminos alternativos

| Caso | Resultado |
|---|---|
| **FR1** Flota detenida (`caer-flota.sh`) | Los campos de Viajes y Finanzas salen; los de Flota en `null` con `DEPENDENCIA_NO_DISPONIBLE`; cc-flota muestra "Flota no disponible" |
| **FR2** Finanzas API caída (`caer-finanzas-api.sh`) | Respuesta GraphQL parcial: el tablero muestra viajes y unidades, y la tarjeta de saldos dice "Finanzas no disponible" |
| **FC6** Latencia (Toxiproxy en 28103) | El servicio afectado pasa los 3 s: sus campos salen en `null` con su error y el resto llega a tiempo (solo local) |
| **FR3** App caída (`caer-app.sh cc-flota`) | La barra marca cc-flota "no disponible"; las otras 3 apps siguen (solo nube) |
| Token vencido en una consulta | `401`; `ui-comun` renueva y repite una vez |
| Consulta demasiado profunda | Error `CONSULTA_DEMASIADO_COMPLEJA`, sin llamar a servicios |
| Keycloak caído | No se puede iniciar sesión ni renovar; quien ya tiene token sigue hasta que vence |

## Criterios de aceptación

- **FK1. Dado** `POST /graphql` sin token, **entonces** `401`; **dado** un usuario `cliente` en cualquier app `cc-*`, **entonces** la app muestra "Sin acceso" y la API responde `403 SIN_PERMISO`; **y dado** el cliente A que pide por el portal datos del cliente B, **entonces** `403 SIN_PERMISO`.
- **FK2. Dado** el gerente con sesión en `cc-tablero`, **cuando** abre `cc-finanzas` desde la barra, **entonces** entra sin contraseña y la pestaña Red muestra la ida a Keycloak y la vuelta inmediata; **y dado** un `comercial`, **cuando** pulsa "Ver como cliente", **entonces** el portal abre sin contraseña en modo comercial.
- **FK3. Dado** `cc-tablero` y `cc-flota` abiertas, **cuando** se cierra sesión en `cc-tablero` y se vuelve a la pestaña de `cc-flota`, **entonces** `cc-flota` pide login.
- **FK4. Dado** la URL pública de la Temporal UI o de la consola de RabbitMQ, **entonces** no responde; **y por** `tunel-consolas.sh`, sí (solo nube).
- **FR1. Dado** `caer-flota.sh`, **cuando** se abre el tablero, **entonces** responde `200` con datos de Viajes y Finanzas y el error de Flota en `errors[]`.
- **FR2. Dado** `caer-finanzas-api.sh`, **cuando** se abre el tablero, **entonces** la respuesta es parcial con `DEPENDENCIA_NO_DISPONIBLE` en los campos de Finanzas.
- **FC6. Dado** Toxiproxy con 5 s de latencia en 28103, **cuando** se consulta el tablero, **entonces** responde en ≤ 3,5 s con los campos de ese servicio en `null` y su error.
- **FR3. Dado** `caer-app.sh cc-flota`, **entonces** la barra de las otras apps lo marca "no disponible" en ≤ 60 s y ellas siguen funcionando.
- **Dado** un `despachador`, **cuando** pide `viajesEnCurso { monto }`, **entonces** `monto` sale en `null` con `SIN_PERMISO` y los demás campos salen.
- **Dado** una consulta de profundidad 12, **entonces** `CONSULTA_DEMASIADO_COMPLEJA`.
- **Dado** `registrarPago` enviado dos veces con la misma `claveIdempotencia`, **entonces** Finanzas recibe dos veces la misma `Idempotency-Key` y hay un solo pago (spec 008).
- **Dado** la suscripción abierta, **cuando** vence el token, **entonces** se cierra con `4401`, `ui-comun` reconecta con un token nuevo y la campana no pierde alertas.
- **Dado** un `chofer` con la app del chofer, **cuando** abre `cc-tablero`, **entonces** ve "Tu cuenta no tiene acceso".

## Cómo se demuestra en la defensa

H9: el gerente entra a `cc-tablero` y salta a `cc-finanzas` con la pestaña Red abierta (FK2); "Ver como cliente" desde `cc-operaciones`; cierre de sesión único (FK3); un usuario cliente en `cc-*` (FK1). Luego `caer-flota.sh` y `caer-finanzas-api.sh` con el tablero abierto (FR1, FR2) y Toxiproxy (FC6). En la nube: `caer-app.sh cc-flota` (FR3) y las URL públicas de las consolas (FK4).
