# Servidor MCP

Herramientas cerradas del sistema para el agente "vigilar viajes" y la consulta por voz (spec 014). Es NestJS 11 con el SDK v2 de MCP (`@modelcontextprotocol/server`), **especificación 2026-07-28 sin sesiones de protocolo**, en `POST /mcp`; las peticiones de la era 2025 también se atienden, sin estado. Contrato: [`contratos/mcp/herramientas.md`](../../contratos/mcp/herramientas.md) (D92).

- **Un servidor por petición:** solo se registran las herramientas que permite el rol del token. `tools/list` del agente devuelve 6 y el del gerente 7. Una herramienta oculta responde `-32602`, igual que una inexistente.
- **Entradas zod `.strict()`** publicadas como JSON Schema con `additionalProperties: false`. `{placa: {"$ne": ""}}` no pasa: a Flota solo llegan escalares. Las salidas se validan con su esquema y no pasan de 16 KB (D88); `ejecutar_reporte` recorta filas y marca `truncado`.
- **Sin reenviar tokens:** cada herramienta llama a una sola operación REST con el token intercambiado (`libs/intercambio-token`) y espera 15 s como máximo (D90). Si el servicio falla, devuelve `isError` con su `codigo`.
- **Bitácora como dato:** `buscar_bitacora` envuelve el texto en `{tipo: "dato_no_confiable", fuente: "bitacora_chofer"}`, y el prompt de la misión prohíbe obedecerlo (FM2).
- **Seguridad HTTP:** audiencia `mcp-server` y `azp` registrado (`MCP_CLIENTES`, por defecto `agente,analitica`). Sin token → `401` con `WWW-Authenticate`; otro cliente → `403`; más de 30 llamadas por minuto por `sub` y `azp` → `429` con `Retry-After`.
- **Auditoría:** una línea JSON por llamada en stdout (`canal = SISTEMA`, `accion = mcp.<herramienta>`, sin texto libre, D91).
- `proponer_accion` reenvía `X-Mision-Id` (límite de 3 por misión en Analítica) con una `Idempotency-Key` nueva.

## Correr

```bash
npm ci
npm run verificar   # tipos, formato y pruebas con el cliente oficial (T10.5: tools/list del agente contra el contrato)
docker compose -f ../../plataforma/compose/compose.yaml --profile core --profile plataforma --profile ia up -d mcp-server
```

Inspector: `npx @modelcontextprotocol/inspector` apuntando a `http://localhost:8106/mcp` con `Authorization: Bearer <token del agente con audiencia mcp-server>`.
