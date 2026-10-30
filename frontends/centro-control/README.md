# Centro de Control

Cuatro apps Angular 22 independientes y la librería `ui-comun`, en un solo workspace (propuesta 6.1, spec 016). No hay shell ni federación: cada app tiene su cliente OIDC, su build y su hosting, y se enlazan solo por URL. El SSO de Keycloak hace el salto entre apps sin pedir contraseña.

| App | Puerto local | Roles | Pantallas |
|---|---|---|---|
| `cc-tablero` | 4201 | Puerta de entrada; se queda el gerente | Tablero (Viajes, Flota, Finanzas y Analítica en una consulta), reportes con Excel |
| `cc-operaciones` | 4202 | despachador, comercial (lectura), gerente | Viajes y detalle, mapa en vivo (Leaflet), entregas observadas, intervenciones, servicios (cancelar, "Ver como cliente") y acciones del agente |
| `cc-flota` | 4203 | jefe_flota, gerente | Unidades, mantenimiento (programar y cerrar), combustible (anomalías y cargas), puntaje de conducción |
| `cc-finanzas` | 4204 | administracion, gerente | Facturas y pagos (con OCR del recibo en el navegador), cuentas por cobrar, aprobación de crédito, cotizaciones |

## `ui-comun`

- **Sesión** (`oidc-client-ts`): Authorization Code + PKCE con el cliente de cada app. El token vive en memoria (D27) y se renueva con el refresh token 30 s antes de vencer y al volver a la pestaña. Si la sesión se cerró en otra app (`invalid_grant`), pide login (FK3). "Cerrar sesión" termina la sesión de Keycloak.
- **Apollo** hacia el Gateway: el token va en `Authorization` y, en el WebSocket, en `connection_init`. Con 401 renueva y repite una vez. La suscripción reconecta con espera de 1, 2, 4… s hasta 30 s (D99) y no reintenta con `4403`.
- **Marco:** barra con las apps que el rol permite, que pide `/salud.json` de cada una cada 60 s y deshabilita el enlace si falla (FR3). Campana con las alertas por rol: al conectar y al reconectar pide `alertasPendientes(desde)` y descarta las repetidas. Enlaces por URL a la app de cada alerta.
- **Acceso:** `cliente` y `chofer` ven "Sin acceso" (con enlace al portal para el cliente). Cada app exige sus roles; el Gateway y los servicios vuelven a validar.
- Respuesta parcial: `servicioCaido(error, campo)` muestra "Finanzas no disponible" solo en su tarjeta (FR1, FR2). `nuevaClave()` da una `claveIdempotencia` por intento. Los montos se muestran como texto con `BobPipe`; nunca se calculan en float.

## GraphQL Code Generator (D49)

Cada proyecto escribe sus operaciones en `*.graphql`. `npm run generar` produce los servicios tipados de Apollo Angular (`graphql/generado.ts`) desde `contratos/graphql/centro-control.graphql`. La CI falla si lo versionado no coincide (`npm run generar:verificar`).

## Configuración

Cada app lee `/configuracion.json` del hosting antes de arrancar (issuer, cliente OIDC, URL del Gateway y de las demás apps). En la nube se cambia ese archivo sin recompilar. En local, el issuer `http://localhost:8080` redirige al `KC_HOSTNAME` del compose (`<mac>.local`), que es el emisor que valida el Gateway.

## Correr

```bash
npm ci
npm run verificar               # formato, pruebas de ui-comun y build de las 4 apps
npx ng serve cc-tablero         # http://localhost:4201 (y cc-operaciones 4202, cc-flota 4203, cc-finanzas 4204)
```

Necesita el Gateway (`plataforma/compose`, servicio `gateway` en 8105) con `CORS_ORIGENES` que incluya los 4 orígenes.
