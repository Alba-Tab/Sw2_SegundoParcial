# AGENTS.md

Instrucciones para asistentes de código (Claude Code, Codex, Copilot) que trabajan en este monorepo. Cada servicio tendrá además su propio `AGENTS.md` con sus reglas de capas; ese archivo manda dentro de su carpeta.

## Fuentes de verdad, en este orden

1. `contratos/`: APIs, eventos, esquema GraphQL y contrato de Temporal.
2. `specs/`: un archivo por flujo. `specs/000-convenciones.md` aplica a todo.
3. `docs/propuesta-tecnica-v3.md`: decisiones de arquitectura y alcance.
4. El código existente.
5. `docs/diagramas-plantuml-transporte/`: solo guía. Si un diagrama contradice al código o a la propuesta, no lo sigas.

Si dos fuentes se contradicen, no elijas por tu cuenta: señálalo y pregunta.

## Reglas que no se rompen

- **Contratos primero.** No cambies un endpoint, un evento, una actividad de Temporal ni el esquema GraphQL sin cambiar antes su archivo en `contratos/`, en el mismo commit.
- **Nada compartido entre servicios.** Ni llaves foráneas, ni bases compartidas, ni imports de código de otro servicio. Entre servicios solo viajan UUID y copias actualizadas por eventos.
- **No agregues llamadas síncronas nuevas entre servicios** sin que estén en la propuesta o en una spec.
- **Idempotencia:** toda operación que el cliente puede reenviar lleva `Idempotency-Key` y una sola autoridad que decide si ya se hizo, en la misma transacción que el cambio (tabla de la sección 4.3 de la propuesta).
- **Eventos:** se publican con Outbox (misma transacción que el cambio) y se consumen con Inbox (`eventId` como llave). Nunca publiques directo al broker desde un caso de uso.
- **Dinero:** nunca `float`/`double`. Ver `specs/000-convenciones.md`.
- **Seguridad:** cada servicio valida el token y filtra las filas por `clienteId` o `sub`; el menú del frontend no es seguridad. No reenvíes tokens entre servicios: se intercambian (RFC 8693).
- **Sin secretos en el repo.** Solo `.env.example` con valores de ejemplo.

## Fuera de alcance: no lo agregues

Facturación fiscal del SIN (CUF, código de control, dosificación, NIT validado, notas de crédito), anticipos y liquidación del chofer, pasarela de pago, varios usuarios por cliente, pedidos por WhatsApp, adjuntos en los correos, cancelación de viajes en ruta desde el portal, data warehouse u OLAP, shell o Module/Native Federation en Angular.

## Idioma y nombres

- Dominio, clases, métodos, tablas, eventos y endpoints en **español, sin tildes ni ñ** (`Cotizacion`, `lineaCredito`, `anio`). En documentos y textos de pantalla, con tildes.
- Términos técnicos del framework se quedan en inglés (`Controller`, `Repository`, `Module`, `useQuery`).
- Usa el lenguaje de la propuesta: viaje, servicio, cotización, línea de crédito, reserva, hito, entrega, bitácora, unidad, tracto, remolque.

## Arquitectura por pieza

| Pieza | Estilo | Lo esencial |
|---|---|---|
| `servicios/viajes` | Hexagonal | `dominio/` no importa Spring ni nada de `adaptadores/`. Los puertos viven en `aplicacion/`. ArchUnit lo verifica |
| `servicios/flota` | Clean | `dominio/` y `aplicacion/` no importan NestJS, Mongoose ni librerías de infraestructura. Un caso de uso por clase. dependency-cruiser lo verifica |
| `servicios/finanzas` | DDD táctico | Agregados con invariantes (`LineaCredito`, `Cotizacion`, `Factura`), value object `Monto` con `brick/money`. `Dominio` no conoce Eloquent. Deptrac lo verifica |
| `servicios/analitica` | CQRS de lectura | Consume eventos con Inbox; los números de los reportes se calculan en código, nunca los inventa el LLM |
| `servicios/gateway` | BFF GraphQL | Solo compone; sin reglas de negocio. DataLoader, límites de profundidad, respuesta parcial si cae un servicio |
| `servicios/mcp-server` | Herramientas cerradas | Sin SQL ni GraphQL generado por el LLM. Parámetros validados con zod |
| `frontends/centro-control` | 4 apps Angular + `ui-comun` | Por feature: `domain/`, `data/`, `ui/`. Fachada sobre Signals, repositorio sobre Apollo. Las apps no se importan entre sí; solo se enlazan por URL |
| `frontends/portal-cliente` | React | TanStack Query para datos del servidor, react-hook-form + zod en formularios |
| `movil/app-chofer` | Offline-first | Toda escritura pasa por la cola local en SQLite con su clave UUID. Las carpetas `ios/` y `android/` se generan con `expo prebuild` y no se versionan |

## Antes de terminar un cambio

1. Corre las pruebas y el lint de la carpeta que tocaste (cada `README` de servicio dice cómo).
2. Si cambiaste un contrato, revisa que los productores y consumidores de ese contrato sigan compilando.
3. Si el cambio altera la estructura (nuevo agregado, nuevo evento, nuevo estado), anótalo para actualizar la documentación ICONIX; no edites los `.docx` ni los `.eap`.
4. No hagas commit ni push salvo que te lo pidan.

## Git

- **Ramas fijas:** `main` (lo que se despliega) y `develop` (integración). No se trabaja directo en ninguna de las dos.
- **Toda rama sale de `develop`** y se publica rastreada desde el primer push: `git push -u origin <rama>`.
- **El nombre de la rama dice dónde se trabajó y qué se hizo:** `<tipo>/<pieza>/<que-se-hizo>`, en minúsculas y con guiones. Ejemplos: `feat/viajes/alta-cliente`, `fix/flota/liberar-reserva`, `docs/specs/programar-viaje`, `chore/plataforma/compose-local`.
  - `<pieza>` es la carpeta principal tocada: `viajes`, `flota`, `finanzas`, `analitica`, `gateway`, `mcp-server`, `cc-tablero`, `cc-operaciones`, `cc-flota`, `cc-finanzas`, `ui-comun`, `portal-cliente`, `app-chofer`, `contratos`, `plataforma`, `specs`, `ci`.
- **Commits por feature, con Conventional Commits:** `<tipo>(<pieza>): <qué hace, en presente>`. Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`, `build`. Un commit = un cambio con sentido propio que compila y pasa sus pruebas.
- **Nunca agregues coautoría ni firmas** en commits ni PR: nada de `Co-Authored-By`, `Signed-off-by` de un asistente, ni "Generated with…".
- **Flujo:** rama → PR a `develop` → revisión y CI en verde → merge. `develop` pasa a `main` por PR cuando se quiere desplegar.
- `docs/` no se sube (está en `.gitignore`): la propuesta y el análisis viven solo en local.

## Comandos

> Pendiente: se completa cuando exista cada servicio. Formato esperado por carpeta: instalar, correr, probar, lint.
