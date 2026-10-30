# @transporte/intercambio-token

Intercambio de tokens RFC 8693 con Keycloak (T9.2, propuesta 7.3). Lo usan el Gateway (cliente `gateway`) y el servidor MCP (cliente `mcp-server`): ningún servicio reenvía el token que recibe, sino que pide uno a nombre del mismo usuario con la audiencia de cada servicio.

```js
const { IntercambioToken } = require('@transporte/intercambio-token');
const intercambio = new IntercambioToken({ issuer: process.env.OIDC_ISSUER, clienteId: 'gateway', clienteSecreto: process.env.OIDC_CLIENTE_SECRETO });
const token = await intercambio.tokenPara(tokenDelUsuario, 'viajes'); // aud = viajes, mismo sub y roles
const servicio = await intercambio.tokenDeServicio('analitica');      // client credentials (descarga de Excel, D21)
```

- Pide `audience=<servicio>` y `scope=aud-<servicio>` (los *client scopes* `aud-*` del realm).
- Guarda el token en una caché en memoria por `sub` y audiencia hasta 30 s antes de que venza (spec 016, paso 7). La clave lleva además un hash SHA-256 del token recibido: lo intercambiado solo se reutiliza para ese mismo token, y el token no queda guardado. Si llegan dos pedidos iguales al mismo tiempo, se hace un solo intercambio.
- Errores con el código de 000 §5 y mensajes propios (el texto de Keycloak no sale): token del usuario vencido, revocado o de una sesión cerrada (`invalid_grant`, `invalid_token` o un `400` que habla del *subject token*, como `invalid_request` "Invalid token") → `NO_AUTENTICADO` (401; el usuario renueva). Intercambio no permitido → `SIN_PERMISO` (403). Keycloak caído o lento (5 s) → `DEPENDENCIA_NO_DISPONIBLE` (503).
- CommonJS sin dependencias, con tipos en `index.d.ts`. Se enlaza con `"@transporte/intercambio-token": "file:../../libs/intercambio-token"`.

```bash
npm test   # node --test
```
