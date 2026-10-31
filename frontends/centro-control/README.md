# Centro de Control

Cuatro apps Angular 22 independientes y la librería `ui-comun`, en un solo workspace (propuesta 6.1, spec 016). No hay shell ni federación: cada app tiene su cliente OIDC, su build y su hosting, y se enlazan solo por URL. El SSO de Keycloak hace el salto entre apps sin pedir contraseña.

| App | Puerto local | Roles | Pantallas |
|---|---|---|---|
| `cc-tablero` | 4201 | Puerta de entrada; se queda el gerente | Tablero (Viajes, Flota, Finanzas y Analítica en una consulta), reportes con Excel, pregunta por voz y panel del agente |
| `cc-operaciones` | 4202 | despachador, comercial (lectura), gerente | Viajes y detalle, mapa en vivo (Leaflet), entregas observadas, intervenciones, servicios (cancelar, "Ver como cliente") y acciones del agente |
| `cc-flota` | 4203 | jefe_flota, gerente | Unidades, mantenimiento (programar y cerrar), combustible (anomalías y cargas), puntaje de conducción |
| `cc-finanzas` | 4204 | administracion, gerente | Facturas y pagos (con OCR del recibo en el navegador), cuentas por cobrar, aprobación de crédito, cotizaciones |

## `ui-comun`

- **Sesión** (`oidc-client-ts`): Authorization Code + PKCE con el cliente de cada app. El token vive en memoria (D27) y se renueva con el refresh token 30 s antes de vencer y cada vez que se vuelve a la pestaña (como máximo una vez cada 10 s). Si la sesión se cerró en otra app (`invalid_grant` o `login_required`), pide login (FK3); con la red o Keycloak caídos conserva el token y reintenta. "Cerrar sesión" termina la sesión de Keycloak.
- **Apollo** hacia el Gateway: el token va en `Authorization` y, en el WebSocket, en `connection_init`. Con 401 renueva y repite una vez; si no hay token nuevo, la operación termina con el error y al cancelarla se cancela también la repetición. La suscripción reconecta con espera de 1, 2, 4… s hasta 30 s (D99) y no reintenta con `4403`. El cierre `4401` (token vencido o los 3.600 s de Cloud Run) es fatal para graphql-ws: lo reintenta la campana con un token renovado.
- **Marco:** barra con las apps que el rol permite, que pide `/salud.json` de cada una cada 60 s (con CORS) y deshabilita el enlace si no responde un 2xx con `{"estado":"UP"}` (FR3). Por eso, en la nube, el hosting de cada app tiene que servir `/salud.json` con `Access-Control-Allow-Origin` para los orígenes de las otras apps; en local, el dev server de Angular ya lo manda. Campana con las alertas por rol: al conectar y al reconectar pide `alertasPendientes(desde)` y descarta las repetidas. Enlaces por URL a la app de cada alerta.
- **Acceso:** `cliente` y `chofer` ven "Sin acceso" (con enlace al portal para el cliente). Cada app exige sus roles; el Gateway y los servicios vuelven a validar.
- Respuesta parcial: `servicioCaido(error, campo)` muestra "Finanzas no disponible" solo en su tarjeta del tablero, y `<cc-aviso-servicios>` pone el mismo aviso en las demás páginas (FR1, FR2).
- Idempotencia: `Intentos` da una `claveIdempotencia` por intento. La conserva solo si se reenvían los mismos datos después de una red caída, un 5xx o un `409 IDEMPOTENCIA_EN_PROCESO`; con datos distintos o después de una respuesta definitiva, la clave es nueva.
- Los montos se muestran como texto con `BobPipe`; nunca se calculan en float.

## Capas por feature

Cada app se organiza por feature (por ejemplo `cc-flota/src/app/unidades/`), con tres capas y una fachada:

| Carpeta | Qué tiene | No puede |
|---|---|---|
| `domain/` | Tipos y reglas de presentación puras (`lineasChecklist`, `paramsCobranza`, `motivoCancelacionValido`…), con sus pruebas | Importar Angular, Apollo, rxjs ni otras capas; del código generado, solo `import type`; de `ui-comun`, solo los ayudantes puros de dinero y fechas |
| `data/` | El repositorio que envuelve los servicios `*GQL` de Apollo (y el OCR en cc-finanzas) | Importar `ui/` ni fachadas |
| `<feature>.fachada.ts` | Fachada con Signals que la UI lee; se provee por componente, así el sondeo vive y muere con la página | — |
| `ui/` | Los componentes: plantilla, estado del formulario y avisos | Inyectar `*GQL` ni usar Apollo o `data/` directamente |

`npm run capas` (dentro de `verificar`) revisa estas reglas, como ArchUnit en Viajes o dependency-cruiser en Flota.

## Voz y agente en cc-tablero (T10.4)

- **Pregunta por voz** (`/voz`, spec 015): se mantiene pulsado para hablar (como máximo 15 s, D94). Whisper `tiny` transcribe en un Web Worker con `transformers.js`, y el texto se puede corregir antes de enviar (D95). El modelo (`npm run modelos`, 43 MB, no se versiona) y el runtime de ONNX se sirven desde el hosting de la app (`/modelos`, `/ort`) con `allowRemoteModels = false`: la pestaña Red no muestra pedidos a un CDN ni el audio saliendo.
- La respuesta trae el texto, la tabla, el gráfico y "Exportar a Excel". Una aclaración muestra botones que corren `reporte(id, params)` sin LLM. Con `LLM_NO_DISPONIBLE` o una pregunta fuera del catálogo quedan los 5 reportes como botones (FR4).
- **Panel del agente** (`/agente`, spec 014): las misiones con cada paso (herramienta, argumentos, resumen y ms) y "Disparar misión". Si ya hay una en curso avisa (`409`), y sin LLM la misión queda saltada. Las acciones se deciden en cc-operaciones.

## OCR en cc-finanzas

Tesseract.js lee el recibo en el navegador (spec 008, paso 2). El worker y el core LSTM salen de `node_modules` y el build los copia a `/tesseract`; el idioma `spa` (`spa.traineddata.gz`, 2 MB, no se versiona) lo baja `npm run modelos` a `public/tesseract`. Con `workerPath`, `corePath` y `langPath` apuntando al hosting propio, la pestaña Red no muestra pedidos a jsdelivr (D38).

## GraphQL Code Generator (D49)

Cada proyecto escribe sus operaciones en `*.graphql`. `npm run generar` produce los servicios tipados de Apollo Angular (`graphql/generado.ts`) desde `contratos/graphql/centro-control.graphql`. La CI falla si lo versionado no coincide (`npm run generar:verificar`).

**Complejidad (D101).** El Gateway rechaza con `CONSULTA_DEMASIADO_COMPLEJA` toda operación de más de 1.000: cada campo vale 1, una lista con `limite` multiplica por él (1 a 100) y Apollo agrega `__typename` a cada objeto y a cada fragmento. `npm run complejidad` (dentro de `verificar`) cuenta cada operación con esa regla y falla si alguna se pasa. Por eso las listas piden solo lo que muestran y usan `limite: 80` (el mapa, 50): esas consultas no tienen `cursor` en el contrato.

## Configuración

Cada app lee `/configuracion.json` del hosting antes de arrancar (issuer, cliente OIDC, URL del Gateway y de las demás apps). En la nube se cambia ese archivo sin recompilar. En local, el issuer `http://localhost:8080` redirige al `KC_HOSTNAME` del compose (`<mac>.local`), que es el emisor que valida el Gateway.

## Correr

```bash
npm ci
npm run modelos                 # Whisper tiny (voz de cc-tablero) y Tesseract spa (OCR de cc-finanzas), una vez
npm run verificar               # formato, pruebas de ui-comun y build de las 4 apps
npx ng serve cc-tablero         # http://localhost:4201 (y cc-operaciones 4202, cc-flota 4203, cc-finanzas 4204)
```

Necesita el Gateway (`plataforma/compose`, servicio `gateway` en 8105) con `CORS_ORIGENES` que incluya los 4 orígenes.
