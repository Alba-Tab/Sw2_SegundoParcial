# Servidor MCP

Herramientas cerradas del sistema para el agente "vigilar viajes" y la consulta por voz (spec 014). Es NestJS 11 con el SDK v2 de MCP (`@modelcontextprotocol/server`), **especificación 2026-07-28 sin sesiones de protocolo**, en `POST /mcp`; las peticiones de la era 2025 también se atienden, sin estado. Contrato: [`contratos/mcp/herramientas.md`](../../contratos/mcp/herramientas.md) (D92).

- **Un servidor por petición:** solo se registran las herramientas que permite el rol del token. `tools/list` del agente devuelve 6 y el del gerente 7. Una herramienta oculta responde `-32602`, igual que una inexistente.
- **Entradas zod `.strict()`** publicadas como JSON Schema con `additionalProperties: false`. Las valida el handler con el mismo zod (no el SDK): argumentos inválidos → `isError` con `structuredContent: {codigo: "VALIDACION", mensaje}`. `{placa: {"$ne": ""}}` no pasa: a Flota solo llegan escalares; una fecha tiene que existir (`2026-13-45` no). Las salidas se validan con su esquema y no pasan de 16 KB (D88); `ejecutar_reporte` recorta filas y `buscar_bitacora` las entradas más viejas, y marcan `truncado`.
- **Sin reenviar tokens:** cada herramienta llama a una sola operación REST con el token intercambiado (`libs/intercambio-token`) y espera 15 s como máximo (D90). Si el servicio falla, devuelve `isError` con su `codigo`.
- **Bitácora como dato:** `buscar_bitacora` envuelve el texto en `{tipo: "dato_no_confiable", fuente: "bitacora_chofer"}`, y el prompt de la misión prohíbe obedecerlo (FM2).
- **Seguridad HTTP:** audiencia `mcp-server` y `azp` registrado (`MCP_CLIENTES`, por defecto `agente,analitica`). Sin token → `401` con `WWW-Authenticate`; otro cliente → `403`; más de 30 llamadas a herramientas (`tools/call`) por minuto por `sub` y `azp` → `429` con `Retry-After` (las claves vencidas se borran). Un JSON roto → `400` en Problem Details. El `title` de los Problem Details es un texto para personas; el `codigo` es el estable de 000 §5.
- **Auditoría:** una línea JSON por llamada en stdout con el esquema de 000 §9 (`id`, `canal = SISTEMA`, `accion = mcp.<herramienta>`, `entidad`, `entidadId`, sin texto libre, D91), también las rechazadas (validación, `-32602` y límite, sin argumentos). Usa el `X-Correlation-Id` del cliente si es un UUID, también hacia los servicios; si no, genera uno.
- **Logs:** los de Nest salen en JSON (000 §10).
- `proponer_accion` reenvía `X-Mision-Id` (límite de 3 por misión en Analítica) con una `Idempotency-Key` nueva. Si la cabecera llega y no es un UUID → `400 VALIDACION` en Problem Details sin ejecutar nada (ignorarla dejaría pasar la acción sin límite). Que la misión exista y esté en curso lo verifica Analítica.

## Correr

```bash
npm ci
npm run verificar   # tipos, formato y pruebas con el cliente oficial (T10.5: tools/list del agente contra el contrato)
docker compose -f ../../plataforma/compose/compose.yaml --profile core --profile plataforma --profile ia up -d mcp-server
```

Inspector: `npx @modelcontextprotocol/inspector` apuntando a `http://localhost:8106/mcp` con `Authorization: Bearer <token del agente con audiencia mcp-server>`.
