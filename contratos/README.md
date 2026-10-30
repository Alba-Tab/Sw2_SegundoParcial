# Contratos

Fuente de verdad de todo lo que cruza entre servicios (AGENTS.md: "contratos primero"). La primera versión de cada contrato entra en su propio PR; los cambios posteriores van en el mismo PR que sus productores y consumidores.

| Carpeta | Qué hay | Lo usan |
|---|---|---|
| `comun/` | Tipos JSON Schema compartidos (UUID, instante, monto, coordenadas, enums) | Temporal y eventos |
| `temporal/` | Workflow `ProgramarViaje`: documento del contrato y esquemas con ejemplos (*fixtures*) | Workers de Viajes (Java), Finanzas (PHP) y Flota (TypeScript) |
| `eventos/` | Sobre, un esquema por evento v1, `asyncapi.yaml` y la tabla de colas | Todos los productores y consumidores, n8n |
| `openapi/` | APIs REST en OpenAPI 3.0.3 (`viajes`, `finanzas`, `flota`, `analitica`, `gateway`, `comun`) | Portal, app del chofer, Gateway, MCP, generadores de código (§15 del plan) |
| `graphql/` | Esquema del Gateway del Centro de Control (`centro-control.graphql`, spec 016), con la directiva `@roles` | Gateway y las 4 apps Angular (GraphQL Code Generator, D49) |

## Validar

Requiere Node 24 o posterior.

```bash
npm ci && npm run validar
```

- `validar:esquemas`: compila todos los `*.schema.json` (JSON Schema 2020-12) y valida cada ejemplo contra su esquema.
- `validar:asyncapi`: valida `eventos/asyncapi.yaml` con el parser oficial, resolviendo los esquemas.
- `validar:openapi`: Spectral con `.spectral.yaml` (reglas de OpenAPI más "todo POST de negocio exige `Idempotency-Key`").
- `validar:graphql`: compila el esquema con graphql-js y exige `claveIdempotencia` en toda mutación salvo `preguntar`.

Desde T3a.5 esto corre en CI (`contratos.yml`) y bloquea el merge.
