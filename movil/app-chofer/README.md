# App del chofer

React Native + Expo SDK 57 (nueva arquitectura, Hermes), React Native Paper con el tema de `libs/design-tokens` (D46, D47). Offline-first (spec 005): toda escritura va primero a una cola en SQLite con su `opId` y el motor la envía al recuperar la señal.

## Capas (Clean)

| Carpeta | Qué hay | Importa |
|---|---|---|
| `src/dominio` | Cola y su orden, reintentos (*full jitter*, base 1 s, máximo 5 min, `Retry-After` manda), reglas del viaje local | Nada |
| `src/aplicacion` | Puertos, `MotorSincronizacion` y casos de uso (descargar viajes, iniciar, encolar, registrar el dispositivo) | Dominio |
| `src/datos` | SQLite con Drizzle (`esquema.ts`, migraciones en `drizzle/`), cliente Orval de `contratos/openapi`, sesión de Keycloak, red, tarea en segundo plano, raíz de composición | Aplicación y dominio |
| `src/presentacion` | Pantallas Paper y el *hook* de los disparadores del motor | Todo |

Dominio y aplicación son TypeScript puro y se prueban con Vitest y puertos falsos (`npm test`).

## Motor de sincronización (spec 005, CU-08)

- Una tanda a la vez: renueva el access token con el refresh token *offline* (D27) y, si da `invalid_grant`, pide iniciar sesión **sin borrar la cola**.
- Por viaje, una petición a la vez y en orden: `INICIO`, luego hitos, eventos y cargas por hora de creación, la entrega al final.
- Red, 5xx, 429, `409 IDEMPOTENCIA_EN_PROCESO` y `409 CONFIRMACION_EN_CURSO` se reintentan con la misma clave. Otro 4xx deja la operación `FALLIDA` con su código. Un `409 CONFLICTO_ESTADO` con el viaje `CANCELADO` descarta la cola de ese viaje (7 días en Descartadas, D54) y avisa "Viaje cancelado; llama al despachador".
- El GPS sale después del inicio confirmado, en lotes de hasta 100, uno a la vez; un 503 con `Retry-After` (FO4) solo hace crecer "Pendientes". Al abrir, el cursor del dispositivo (D55) borra lo que el servidor ya aceptó.
- Disparadores: cambio de conectividad, app al frente, cada 90 s y la tarea en segundo plano.

## Correr

```bash
npm ci
APP_MAC_LOCAL=<tu-mac>.local npx expo prebuild --platform ios
LANG=en_US.UTF-8 APP_MAC_LOCAL=<tu-mac>.local npx expo run:ios
```

| Variable | Para qué |
|---|---|
| `APP_ENTORNO` | `local` (por defecto: compose en la Mac por `<mac>.local`, que resuelven el simulador de iOS y el iPhone) o `nube` (F11, con `APP_VIAJES_URL`, `APP_FLOTA_URL` y `APP_OIDC_ISSUER`) |
| `APP_MAC_LOCAL` | El nombre `.local` de la Mac; debe coincidir con `OIDC_ISSUER` de `plataforma/compose/.env` |

`ios/` y `android/` se generan con `expo prebuild` y no se versionan. `google-services.json` (FCM, D45) se agrega fuera del repo.

| Comando | Qué hace |
|---|---|
| `npm run verificar` | Tipos, ESLint, Prettier y Vitest |
| `npm run generar:contratos` | Regenera el cliente de `contratos/openapi` (CI falla si no coincide) |
| `npm run generar:migraciones` | Crea la migración de Drizzle al cambiar `src/datos/esquema.ts` |
