# Realm `transporte` (Keycloak 26.8)

Configuración del realm como código (T2.2). Se aplica en dos pasos, los dos idempotentes:

| Archivo | Qué tiene | Cómo se aplica |
|---|---|---|
| `realm-transporte.json` | Ajustes del realm (D26, D27), roles sin rol por defecto (K3), grupo `registro-portal`, client scopes `cliente-id` y `aud-*` (K2), los 14 clientes de la propuesta 7.1 con `fullScopeAllowed=false` y sus *scope mappings*, `demo-cli` (D39) y las cuentas de servicio de `agente` y `viajes` | keycloak-config-cli con `IMPORT_VARSUBSTITUTION_ENABLED=true` |
| `perfil-usuario.json` | Perfil de usuario con `clienteId` (vista y edición solo de administradores) | `configurar-api.sh` (keycloak-config-cli 6.5.1 no lo aplica) |
| `usuarios-semilla.json` | Usuarios de semilla con **ids fijos** (D12, K5) | `configurar-api.sh` por `partialImport` (keycloak-config-cli ignora el `id`); si el usuario ya existe, se salta |
| `configurar-api.sh` | Perfil, usuarios de semilla y permisos FGAP v2 de `viajes` (K4) | Lo llama `aplicar-realm.sh` |
| `probar-realm.sh` | Smoke de 28 pruebas: claims, cadena de 3 intercambios, agente, K3, FGAP v2, device grant y cierre de sesión | A mano, después de aplicar |

Los JSON solo llevan marcadores `$(env:KC_SECRETO_*)` y `$(env:KC_CLAVE_*)`. Si falta una variable, keycloak-config-cli falla (`Cannot resolve variable`) y no aplica nada.

## Uso local

```bash
docker run -d --name kc-realm -p 8080:8080 -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak:26.8 start-dev
cp .env.example .env
./aplicar-realm.sh .env
./probar-realm.sh .env
```

Hasta que exista el compose (T3a.1), Keycloak se levanta con ese `docker run`. Necesita `docker`, `curl` y `jq`.

## Variables

| Variable | Local (`.env.example`) | Nube |
|---|---|---|
| `KC_SECRETO_<CLIENTE>` | `secreto-<cliente>` | Secreto de Container Apps |
| `KC_CLAVE_SEMILLA` | `Clave123!` | Secreto de Container Apps |
| `KC_DEMO_CLI_DIRECT_GRANT` | `true` | `false` (solo *device grant*, D39) |
| `KC_ACCESS_TOKEN_SEG` | `300` (demo: `120`) | `300` |
| `KC_SSL_REQUIRED` | `none` | `external` (valor por defecto) |
| `KC_URL_CC_TABLERO`, `KC_URL_CC_OPERACIONES`, `KC_URL_CC_FLOTA`, `KC_URL_CC_FINANZAS`, `KC_URL_PORTAL` | `http://localhost:4201` … `4204`, `5173` (valores por defecto) | URLs de Firebase Hosting |

## Usuarios de prueba (solo local)

Contraseña local de todos: `Clave123!`. En la nube sale de `KC_CLAVE_SEMILLA` y no se documenta.

| Usuario | Rol | Id fijo (`sub`) |
|---|---|---|
| `gerente1` | gerente | `0193a000-0000-7000-8000-000000000001` |
| `despachador1` | despachador | `…000000000002` |
| `jefeflota1` | jefe_flota | `…000000000003` |
| `administracion1` | administracion | `…000000000004` |
| `comercial1` | comercial | `…000000000005` |
| `chofer1` … `chofer4` | chofer | `…000000000011` … `…000000000014` |
| `agroexport` | cliente, `clienteId = 0193a000-0000-7000-8000-0000000c0001` | `…000000000021` |
| `agromoroso` | cliente, `clienteId = 0193a000-0000-7000-8000-0000000c0002` | `…000000000022` |

La semilla de los servicios (D102, `plataforma/semilla/`) usa estos mismos ids: `usuarioSub` de los choferes en Flota y `clienteId` de Agroexport y Agro Moroso en Viajes. Ninguno queda en `registro-portal`; ahí solo entran los usuarios que se registran en el portal.

## Qué ve cada cliente

| Cliente | Tipo | Audiencia | Roles en el token |
|---|---|---|---|
| `cc-tablero`, `cc-operaciones`, `cc-flota`, `cc-finanzas` | Público, PKCE | `gateway` | Internos (sin `cliente` ni `chofer`) |
| `portal-cliente` | Público, PKCE, registro | `viajes`, `finanzas`; claim `clienteId` | `cliente`, `comercial` |
| `app-chofer` | Público, PKCE, `offline_access` opcional; redirección `transporte-chofer://*` | `viajes`, `flota` | `chofer` |
| `demo-cli` | Público, *device grant* (y *direct grant* en local) | `gateway`, `viajes`, `finanzas`, `flota`, `analitica` | Todos menos `agente_lectura` |
| `gateway`, `analitica`, `mcp-server` | Confidencial, intercambio estándar | La que piden con `audience` y `scope=aud-<cliente>` | Los del usuario |
| `agente` | Confidencial, *client credentials* | `mcp-server` | `agente_lectura` |
| `viajes` | Confidencial, cuenta de servicio con FGAP v2 y `query-users` | — | — |
| `finanzas`, `flota` | Solo validan tokens | — | — |

Notas:
- `default-roles-transporte` no tiene roles del realm. Conserva `manage-account` y `view-profile` del cliente `account`, para que cada usuario pueda cambiar su contraseña; no llegan a los tokens de las apps porque ningún cliente tiene *full scope*.
- El registro está habilitado a nivel de realm, así que el enlace "Registrarse" también aparece en el login de las apps internas. Un usuario que se registra desde ahí no tiene roles, y las apps internas lo rechazan. El tema propio que oculte el enlace queda para F9.
- El salto de SSO entre apps en el navegador (FK2, FK3) se prueba en F9 con las apps reales.
