# Resultados de las pruebas de concepto

Estado: **en curso** (PoC-1 terminada el 29/10/2026; el resto se llena en F2 y F3a). Los criterios de éxito y los planes B están en la sección 7 de [plan-desarrollo.md](plan-desarrollo.md).

| PoC | Fecha | Resultado | Plan B activado | Decisiones que cierra |
|---|---|---|---|---|
| PoC-1 Keycloak | 29/10/2026 | **Pasa** (con dos ajustes) | Ninguno | K1, K3, K4, D27, D39 |
| PoC-2 Temporal en 3 lenguajes | — | pendiente | — | D29, S9, S14, S15 |
| PoC-3 Ollama | — | pendiente | — | D36 |
| PoC-4 App nativa (iPhone y emulador de Android) | — | pendiente | — | D22, D38, D45 |
| PoC-5 Memoria de la Mac | — | pendiente | — | D36 |
| Micro-PoC Whisper web | — | pendiente | — | D38 |
| PoC de despliegue | — | pendiente | — | D32, D33, D35 |

## Notas por PoC

<!-- Por cada PoC: qué se probó, versiones exactas, qué falló, evidencia (comando o captura) y decisión. -->

### PoC-1 Keycloak

- **Versiones:** Keycloak 26.8.1 (`quay.io/keycloak/keycloak:26.8`, `start-dev`); keycloak-config-cli `6.5.1-26.5.5` (la más nueva publicada; no hay imagen para 26.8).
- **Evidencia:** scripts en la rama `chore/plataforma/poc-keycloak` (`plataforma/poc/keycloak/`), que se borra al cerrar H2.

| Qué se probó | Resultado | Nota para T2.2 y el código |
|---|---|---|
| K1: cadena `demo-cli` (como cc-tablero) → `gateway` → `analitica` → `mcp-server` → `analitica` | **200 en los 3 intercambios**, mismo `sub` y mismo `sid` en todos. El bug RHBK-3599 (pérdida de `sid` en el tercer salto) no aparece en 26.8.1 | Cada intercambio debe enviar `audience=<cliente>` **y** `scope=aud-<cliente>`: sin el scope, Keycloak responde `Requested audience not available` (los scopes de audiencia son opcionales del cliente que intercambia). Va en `libs/intercambio-token` |
| Token del agente (client credentials, `agente_lectura`) intercambiado por `mcp-server` hacia `analitica` | Pasa; conserva `agente_lectura` | — |
| K3: sin roles por defecto; `offline_access` solo con `chofer` | Pasa: `gerente1` recibe `not_allowed` al pedir `offline_access`; `chofer1` recibe un refresh `Offline` | El rol compuesto `default-roles-transporte` queda vacío pero sigue apareciendo en `realm_access` (inofensivo) |
| K4: FGAP v2, `viajes` escribe `clienteId` y asigna `cliente` | Pasa: 200/204 sobre un miembro de `registro-portal`; 403 al leer o editar a `gerente1` y al asignar `gerente` | (1) La búsqueda `GET /users?username=` no devuelve usuarios permitidos por grupo: Viajes usa el `sub` del token como id y no busca. (2) `map-roles` solo existe en el tipo *Users*, así que se da para todos los usuarios; `map-role` sigue limitado al rol `cliente` (Viajes puede dar `cliente` a cualquiera y ningún otro rol). (3) Hace falta `query-users` en la cuenta de servicio. (4) Los usuarios internos de la semilla se crean fuera de `registro-portal` |
| Atributo `clienteId` en el perfil (vista y edición solo de administradores) y su claim | Pasa: el token siguiente trae `clienteId` y el rol `cliente` | — |
| D39: *device authorization grant* en `demo-cli` | Pasa (`user_code`, 600 s) | — |
| D27: cierre de sesión detectado al renovar | Pasa: después de `logout`, la renovación da `invalid_grant` | El salto de SSO entre dos SPA con el navegador se comprueba con las apps reales (FK2 y FK3, F9) |
| keycloak-config-cli con variables | Pasa contra 26.8.1: cambió el secreto del `gateway` desde una variable, creó un rol y conservó los scopes existentes | La sintaxis es **`$(env:VAR)`** con `IMPORT_VARSUBSTITUTION_ENABLED=true` (no `${...}`). Se cambió en el plan, AGENTS.md y la regla de gitleaks. Usar `IMPORT_MANAGED_*=no-delete` hasta que el realm completo esté en el archivo |

**Otros hallazgos para T2.2:** Keycloak 26.8 avisa que *Full scope allowed* está obsoleto en los clientes; el realm definitivo lo desactiva y asigna los roles por *scope mapping*. Memoria del contenedor en reposo: unos 600 MB.
