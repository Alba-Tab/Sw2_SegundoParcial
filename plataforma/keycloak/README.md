# Realm `transporte` (Keycloak 26.8)

Configuración del realm como código (T2.2). Se aplica en dos pasos, los dos idempotentes:

| Archivo | Qué tiene | Cómo se aplica |
|---|---|---|
| `realm-transporte.json` | Ajustes del realm (D26, D27), roles sin rol por defecto (K3), grupos `registro-portal`, `personal-interno` y `administra-usuarios` (D103), client scopes `cliente-id` y `aud-*` (K2), los 14 clientes de la propuesta 7.1 con `fullScopeAllowed=false` y sus *scope mappings*, `demo-cli` (D39) y las cuentas de servicio de `agente` y `viajes` | keycloak-config-cli con `IMPORT_VARSUBSTITUTION_ENABLED=true` |
| `perfil-usuario.json` | Perfil de usuario con `clienteId` (vista y edición solo de administradores) | `configurar-api.sh` (keycloak-config-cli 6.5.1 no lo aplica) |
| `usuarios-semilla.json` | Usuarios de semilla con **ids fijos** (D12, K5) y sus grupos | `configurar-api.sh` por `partialImport` (keycloak-config-cli ignora el `id`); si el usuario ya existe, se salta |
| `configurar-api.sh` | Perfil, usuarios de semilla con sus grupos (también los que ya existían), permisos FGAP v2 de `viajes` (K4) y del gerente (D103), y saca del grupo `registro-portal` a los usuarios de semilla y a las cuentas de servicio. Crea o actualiza cada política y permiso | Lo llama `aplicar-realm.sh` |
| `probar-realm.sh` | Smoke de 49 pruebas: claims, rol `interno` en el token del portal, cadena de 3 intercambios, agente, K3, FGAP v2, consola del gerente (D103), device grant y cierre de sesión | A mano, después de aplicar |

Los JSON solo llevan marcadores `$(env:KC_SECRETO_*)` y `$(env:KC_CLAVE_*)`. Si falta una variable, keycloak-config-cli falla (`Cannot resolve variable`) y no aplica nada.

## Uso local

```bash
docker run -d --name kc-realm -p 8080:8080 -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak:26.8 start-dev
cp .env.example .env
./aplicar-realm.sh .env
./probar-realm.sh .env
```

Hasta que exista el compose (T3a.1), Keycloak se levanta con ese `docker run`. Necesita `docker`, `curl` y `jq`.

## Job `keycloak-config` en la nube (B5, T11.3)

`Dockerfile.config` arma la imagen del Job: keycloak-config-cli con `jq` (la base es Ubuntu y ya trae `bash` y `curl`), el realm, el perfil, la semilla y los dos scripts. Con `KC_CONFIG_EN_CONTENEDOR=1`, que la imagen trae fijo, `aplicar-realm.sh` corre el jar directo en vez de `docker run` y luego `configurar-api.sh`. Los valores son los secretos del Job (guía de despliegue §7): `KC_URL`, `KC_ADMIN`, `KC_ADMIN_CLAVE`, los `KC_SECRETO_*` y `KC_CLAVE_*`, y las `KC_URL_*` de las webs.

```bash
docker build -f Dockerfile.config -t keycloak-config .
docker run --rm --network host --env-file .env keycloak-config   # contra el Keycloak de localhost:8080
```

Keycloak usa la imagen oficial con `start`; no hace falta una propia. Su salud está en el puerto de gestión 9000 (`/health/ready`), que sirve de sonda en Container Apps.

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

La semilla de los servicios (D102, `plataforma/semilla/`) usa estos mismos ids: `usuarioSub` de los choferes en Flota y `clienteId` de Agroexport y Agro Moroso en Viajes. Ninguno queda en `registro-portal`; ahí solo entran los usuarios que se registran en el portal. Los internos que no son gerente (`despachador1` … `chofer4`) están en `personal-interno` y `gerente1` en `administra-usuarios`.

## Qué ve cada cliente

| Cliente | Tipo | Audiencia | Roles en el token |
|---|---|---|---|
| `cc-tablero`, `cc-operaciones`, `cc-flota`, `cc-finanzas` | Público, PKCE | `gateway` | Internos (sin `cliente` ni `chofer`), más `interno` |
| `portal-cliente` | Público, PKCE, registro | `viajes`, `finanzas`; claim `clienteId` | `cliente`, `comercial` o, para una cuenta interna, solo `interno` |
| `app-chofer` | Público, PKCE, `offline_access` opcional; redirección `transporte-chofer://*` | `viajes`, `flota` | `chofer`, `interno` |
| `demo-cli` | Público, *device grant* (y *direct grant* en local) | `gateway`, `viajes`, `finanzas`, `flota`, `analitica` | Todos menos `agente_lectura` |
| `gateway`, `mcp-server` | Confidencial, intercambio estándar | La que piden con `audience` y `scope=aud-<cliente>` | Los del usuario |
| `agente` | Confidencial, *client credentials* | `mcp-server` | `agente_lectura` |
| `viajes` | Confidencial, cuenta de servicio con FGAP v2 y `query-users` | — | — |
| `analitica`, `finanzas`, `flota` | Solo validan tokens | — | — |

Notas:
- `interno` no da permisos en ningún servicio. Es hijo compuesto de `gerente`, `despachador`, `jefe_flota`, `administracion` y `chofer`, y `portal-cliente` solo tiene en su *scope* `cliente`, `comercial` e `interno`. Así, una cuenta interna que entra al portal llega con `interno` y sin sus roles (dar `gerente` o `administracion` al portal abriría lectura total desde un cliente público), el portal puede reconocerla y Viajes rechaza su alta de cliente con `403 SIN_PERMISO` (spec 001). Como Keycloak expande los compuestos del *scope*, `interno` también aparece en los tokens de los clientes que ya tienen alguno de esos roles (`cc-*`, `app-chofer`, `demo-cli` y los intercambios); `comercial` no lo recibe.
- **Administración de usuarios (D103).** El gerente entra a `<KC>/admin/transporte/console/`, el enlace que arma `ui-comun`. Lo que puede hacer ahí sale de dos piezas:
  - El grupo `administra-usuarios` le da `query-users`, `query-groups` y `view-realm` de `realm-management`, lo justo para abrir la consola y buscar. No es hijo de `gerente`: así no entra en ningún *scope* y esos roles no llegan a los tokens de `cc-*`, `demo-cli` ni los intercambios. `gerente` lleva `"realm-management": []` para que keycloak-config-cli quite los que tuvo antes.
  - FGAP v2, con dos políticas que deben cumplirse a la vez: `es-gerente` (rol `gerente`, leído del usuario porque la consola usa tokens livianos) y `desde-consola` (`security-admin-console` o `admin-cli`). Con eso ve y gestiona a los miembros de `personal-interno` y solo les asigna `despachador`, `jefe_flota`, `administracion`, `comercial` y `chofer`. No ve ni toca a clientes del portal, cuentas de servicio, otros gerentes ni a sí mismo, y un token de una app no sirve contra la Admin API.
  - Keycloak exige que todos los permisos de un recurso concedan, y `viajes-map-roles-usuarios` (todos los usuarios) no concede al gerente. Por eso, además del permiso de grupo (que sirve para listar), el gerente lleva `gerente-usuarios-internos`, un permiso por usuario con los miembros de `personal-interno` al aplicar. **Quien entra después a `personal-interno` necesita otra corrida de `configurar-api.sh`** antes de que el gerente pueda abrirlo.
  - El gerente no crea usuarios ni cambia grupos: eso sigue en manos del administrador del realm. Con `manage` sobre un interno puede editar su `clienteId` (el perfil solo distingue administrador de usuario y Viajes lo escribe por la Admin API); no le da acceso a datos de clientes porque no puede asignar `cliente`.
- `default-roles-transporte` no tiene roles del realm. Conserva `manage-account` y `view-profile` del cliente `account`, para que cada usuario pueda cambiar su contraseña; no llegan a los tokens de las apps porque ningún cliente tiene *full scope*.
- El registro está habilitado a nivel de realm, así que el enlace "Registrarse" también aparece en el login de las apps internas. Un usuario que se registra desde ahí no tiene roles, y las apps internas lo rechazan. El tema propio que oculte el enlace queda para F9.
- El salto de SSO entre apps en el navegador (FK2, FK3) se prueba en F9 con las apps reales.
