# Sistema de Transporte de Carga

Grupo 53 · INF512-SB Ingeniería de Software II · Segundo parcial

Sistema para una empresa de transporte de carga pesada con base en Santa Cruz: el cliente cotiza y confirma viajes en un portal, el chofer registra el viaje desde el celular aunque no tenga señal, y el equipo interno opera, controla la flota y cobra desde el Centro de Control. Un agente vigila los viajes en curso y propone acciones que una persona aprueba. El caso es genérico y no corresponde a una empresa real.

- **Propuesta técnica (fuente de verdad):** [docs/propuesta-tecnica-v3.md](docs/propuesta-tecnica-v3.md)
- **Análisis previo al desarrollo:** [docs/analisis-pre-desarrollo.md](docs/analisis-pre-desarrollo.md)
- **Convenciones de código y contratos:** [specs/000-convenciones.md](specs/000-convenciones.md)
- **Guía para asistentes de código y flujo de git:** [AGENTS.md](AGENTS.md)

> La carpeta `docs/` (propuesta, análisis, PlantUML, modelos de EA) no se sube al repositorio: cada integrante la tiene en local.

> **Estado:** todo corre en local (fases F0 a F10 de [specs/plan-desarrollo.md](specs/plan-desarrollo.md)). Falta el despliegue multinube con CI/CD (F11) y el ensayo de fallos en la nube (F12).

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
  design-tokens/     tema compartido (Angular, MUI y la app)
  intercambio-token/ intercambio de tokens RFC 8693 (Gateway y MCP)
contratos/
  openapi/ · graphql/ · eventos/ · temporal/ · mcp/
plataforma/
  compose/           docker compose local (perfiles)
  keycloak/          realm (keycloak-config-cli)
  n8n/               flujos exportados
  simulador-combustible/ · simulador-viaje/
  datos-sinteticos/  3 meses de hechos para Analítica
  semilla/           datos iniciales de la demo
  scripts/           demo/ (un script por escenario) y fallos/
specs/               una especificación por flujo, decisiones y plan
docs/                propuesta, análisis, PlantUML, documentos ICONIX (solo local)
.github/workflows/   ci.yml: CI de PR por carpeta con un check ci-ok
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

Detalle en [plataforma/compose/README.md](plataforma/compose/README.md).

```bash
cd plataforma/compose
cp .env.example .env   # MAC_LOCAL=<scutil --get LocalHostName>.local, igual en OIDC_ISSUER
docker compose --profile core --profile plataforma --profile ia up -d --wait
./verificar.sh
../semilla/cargar.sh
```

```bash
ollama pull qwen3:4b-instruct
```

| Perfil | Qué levanta |
|---|---|
| `core` | Viajes, Flota (API y worker), Finanzas (API y worker), Gateway y sus bases |
| `plataforma` | Temporal, RabbitMQ (con MQTT), Keycloak con el realm, n8n, Mailpit |
| `ia` | Analítica y servidor MCP |
| `trazas` | OTel collector y Jaeger |
| `simulador` | Sensor de combustible |
| `demo` | Toxiproxy para los escenarios de fallo |

Los frontends y la app se levantan aparte; cada README dice cómo. Los escenarios de la defensa están en [plataforma/scripts/README.md](plataforma/scripts/README.md).

## Usuarios de prueba

Están en [plataforma/keycloak/README.md](plataforma/keycloak/README.md): uno por rol interno, 4 choferes y 2 clientes, con contraseña local `Clave123!`. En la nube la contraseña sale de un secreto y no se documenta.

## Mapa de puertos

| Pieza | Puerto |
|---|---|
| Viajes · Flota · Finanzas · Analítica · Gateway · MCP | 8101 · 8102 · 8103 · 8104 · 8105 · 8106 |
| cc-tablero · cc-operaciones · cc-flota · cc-finanzas | 4201 · 4202 · 4203 · 4204 |
| Portal del cliente | 5173 |
| Keycloak · Temporal UI · RabbitMQ · n8n · Mailpit | 8080 · 8233 · 15672 · 5678 · 8025 |

El resto (bases, broker, trazas) está en [plataforma/compose/README.md](plataforma/compose/README.md).

## Pruebas

Cada carpeta tiene sus pruebas y sus reglas de arquitectura:

| Pieza | Pruebas | Reglas de capas |
|---|---|---|
| Viajes | JUnit + Testcontainers | ArchUnit |
| Flota | Jest + Testcontainers | dependency-cruiser |
| Finanzas | Pest + Larastan | Deptrac |
| Analítica | pytest | — |
| Gateway y MCP | Jest | — |
| Centro de Control | Vitest (`npm run verificar`) | `scripts/capas.mjs` |
| Portal y app del chofer | Vitest | — |

El CI de PR corre solo las carpetas que cambiaron.

## Documentación de diseño

- `docs/diagramas-plantuml-transporte/`: diagramas ICONIX en PlantUML. Son una guía inicial: si el código y un diagrama no coinciden, manda el código. Varios siguen en la versión 2 de la propuesta (sección 9 del análisis).
- `docs/*.eap` y `*.docx`: modelos de Enterprise Architect y documentos del curso. No se editan desde el código.

## Licencias de terceros

> Pendiente: modelo del detector de fatiga (licencia y dataset). Si se usa un modelo de Ultralytics, es AGPL-3.0.
