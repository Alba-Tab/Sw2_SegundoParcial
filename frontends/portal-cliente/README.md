# Portal del cliente

React 19 + Vite, PWA. Material 3 con **MUI v7** y el tema de `libs/design-tokens` (D46, D47); React Compiler por Babel; TanStack Query, Router y Table (D48); clientes y esquemas zod generados con Orval desde `contratos/openapi` (D49). Puerto **5173**.

| Comando | Qué hace |
|---|---|
| `npm ci` | Instala (los tokens se enlazan desde `../../libs/design-tokens`) |
| `cp .env.example .env` | El issuer de Keycloak con el mismo host que `OIDC_ISSUER` de `plataforma/compose/.env` (los servicios rechazan otro issuer) |
| `npm run generar:contratos` | Regenera `src/api/generado` (Orval: funciones `fetch`, *hooks* de TanStack Query y esquemas zod) desde `contratos/openapi`; CI falla si no coincide |
| `npm run dev` | Servidor de desarrollo en http://localhost:5173 |
| `npm run verificar` | Tipos, ESLint, Prettier y Vitest |
| `npm run build` | Compila a `dist/` |
| `npm run storybook` | Catálogo de componentes en http://localhost:6006 (tema claro y oscuro desde la barra) |

## Sesión y API

- `react-oidc-context` con el cliente público `portal-cliente` (PKCE). Tokens en memoria y renovación con el refresh token, sin iframe (propuesta 7.7). "Crear cuenta" abre el registro de Keycloak con `prompt=create`.
- `src/api/cliente.ts` es el *mutator* de Orval: agrega el token, usa `VITE_VIAJES_URL` o `VITE_FINANZAS_URL` y lanza `ErrorApi` con el Problem Details en cualquier respuesta que no sea 2xx. Cada escritura lleva una `Idempotency-Key` nueva por intento; los reintentos automáticos del mismo intento repiten la clave.
- Spec 001: sin cliente en el token, el portal solo deja completar los datos de la empresa; si Keycloak no vinculó, "Reintentar vinculación"; al vincular, renueva el token.
- Spec 002: cotizar con las reglas del contrato más las de la spec (≤ 30 t, fecha de hoy a 60 días); un 503 `CLIENTE_NO_REPLICADO` se reintenta solo con la misma clave.

## Estructura

- `src/compartido/`: tema, componentes comunes (con su historia de Storybook y su prueba).
- `src/features/<feature>/`: una carpeta por flujo (cuenta, cotizar, servicios, facturas), con sus pruebas (`fetch` simulado en `src/pruebas/`).
- `src/api/generado/`: lo genera Orval; no se edita.
