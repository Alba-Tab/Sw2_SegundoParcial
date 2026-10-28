# Sistema de Transporte de Carga

Grupo 53 · INF512-SB Ingeniería de Software II · Segundo parcial

Sistema para una empresa de transporte de carga pesada con base en Santa Cruz: el cliente cotiza y confirma viajes en un portal, el chofer registra el viaje desde el celular aunque no tenga señal, y el equipo interno opera, controla la flota y cobra desde el Centro de Control. Un agente vigila los viajes en curso y propone acciones que una persona aprueba. El caso es genérico y no corresponde a una empresa real.

- **Propuesta técnica (fuente de verdad):** [docs/propuesta-tecnica-v3.md](docs/propuesta-tecnica-v3.md)
- **Análisis previo al desarrollo:** [docs/analisis-pre-desarrollo.md](docs/analisis-pre-desarrollo.md)
- **Convenciones de código y contratos:** [specs/000-convenciones.md](specs/000-convenciones.md)
- **Guía para asistentes de código y flujo de git:** [AGENTS.md](AGENTS.md)

> La carpeta `docs/` (propuesta, análisis, PlantUML, modelos de EA) no se sube al repositorio: cada integrante la tiene en local.

> **Estado:** preparación. Todavía no hay código; las carpetas de abajo se crean a medida que avanza el orden de trabajo (sección 12 del análisis).

---

## Piezas

| Pieza | Tecnología | Arquitectura | Base de datos |
|---|---|---|---|
| Viajes | Spring Boot 4.1 · Java 25 | Hexagonal | PostgreSQL + DynamoDB + S3 |
| Flota | NestJS 11 · Node 24 | Clean | MongoDB |
| Finanzas | Laravel 13 · PHP 8.4 | DDD táctico | PostgreSQL |
| Analítica | FastAPI · Python 3.13 | CQRS (modelo de lectura) | PostgreSQL |
| Gateway ERP | NestJS + GraphQL | BFF | — |
| Servidor MCP | NestJS + SDK MCP v2 | — | — |
| Centro de Control | 4 apps Angular 22 (`cc-tablero`, `cc-operaciones`, `cc-flota`, `cc-finanzas`) | Vertical por dominio | — |
| Portal del cliente | React 19 + Vite (PWA) | — | — |
| App del chofer | React Native + Expo SDK 57 | Offline-first, Clean | SQLite |

Soporte: Keycloak 26.8 (SSO), Temporal (saga "Programar viaje"), RabbitMQ con MQTT (eventos y sensor), n8n (correos), Ollama (LLM propio).

## Estructura del monorepo

```
servicios/
  viajes/            Spring Boot (hexagonal)
  flota/             NestJS (clean): API y worker
  finanzas/          Laravel (DDD): API y worker
  analitica/         FastAPI
  gateway/           NestJS + GraphQL
  mcp-server/        NestJS + SDK MCP v2
frontends/
  centro-control/    workspace Angular: cc-tablero, cc-operaciones, cc-flota, cc-finanzas, ui-comun
  portal-cliente/    React + Vite
movil/
  app-chofer/        Expo
libs/
  design-tokens/     variables CSS compartidas
contratos/
  openapi/ · graphql/ · eventos/ · temporal/
plataforma/
  compose/           docker compose local (perfiles)
  vm/                compose de la VM, Caddy, certificados
  keycloak/          realm exportado
  n8n/               flujos exportados
  simuladores/       sensor de combustible
  datos-sinteticos/
  scripts/           encender-demo, apagar-demo
specs/               una especificación por flujo
docs/                propuesta, análisis, PlantUML, documentos ICONIX
.github/workflows/   un workflow por unidad + pipelines reutilizables
```

## Requisitos (Mac)

| Herramienta | Versión | Para qué |
|---|---|---|
| Docker Desktop | Reciente, con ≥ 12 GB de memoria asignada | Todo el entorno local |
| Java (Temurin) | 25 | Viajes |
| Node.js | 24 LTS | Flota, Gateway, MCP, frontends, app |
| PHP + Composer | 8.4 | Finanzas |
| Python + uv | 3.13 | Analítica |
| Xcode | Reciente | Build nativa de la app del chofer |
| Ollama | Última con el parche del CVE-2026-7482 | LLM local; corre **nativo**, fuera de Docker, para usar la GPU de la Mac |

Las versiones exactas de cada librería quedan fijadas en el lockfile de cada carpeta.

## Arranque local

> Pendiente: se completa cuando exista `plataforma/compose/`.

Perfiles previstos de docker compose:

| Perfil | Qué levanta |
|---|---|
| `core` | Servicios de dominio y sus bases |
| `plataforma` | Temporal, RabbitMQ, Keycloak (con el realm importado) |
| `ia` | Analítica |
| `demo` | Toxiproxy, MCP Inspector, Mailpit |

```bash
docker compose -f plataforma/compose/compose.yaml --profile core --profile plataforma up -d
```

```bash
ollama pull <modelo-elegido>
```

## Usuarios de prueba

> Pendiente: se definen en el realm exportado (`plataforma/keycloak/`), uno por rol: chofer, despachador, jefe_flota, administracion, gerente, comercial, cliente.

## Mapa de puertos

> Pendiente: se fija junto con el compose. Cada servicio documenta el suyo en su propio README.

## Pruebas

Cada carpeta tiene sus pruebas y sus reglas de arquitectura:

| Pieza | Pruebas | Reglas de capas |
|---|---|---|
| Viajes | JUnit + Testcontainers | ArchUnit |
| Flota | Jest + Testcontainers | dependency-cruiser |
| Finanzas | Pest + Larastan | Deptrac |
| Analítica | pytest | — |

## Documentación de diseño

- `docs/diagramas-plantuml-transporte/`: diagramas ICONIX en PlantUML. Son una guía inicial: si el código y un diagrama no coinciden, manda el código. Varios siguen en la versión 2 de la propuesta (sección 9 del análisis).
- `docs/*.eap` y `*.docx`: modelos de Enterprise Architect y documentos del curso. No se editan desde el código.

## Licencias de terceros

> Pendiente: modelo del detector de fatiga (licencia y dataset). Si se usa un modelo de Ultralytics, es AGPL-3.0.
