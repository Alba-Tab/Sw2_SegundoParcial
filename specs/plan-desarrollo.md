# Plan de desarrollo: Sistema de Transporte de Carga

Estado: **aprobado** (28/10/2026) · Revisión 4 · Lo construye una persona con asistentes de código.

Este plan lo escribió un agente planificador y lo revisó un agente revisor en cuatro rondas (31, 13, 0 y 10 hallazgos; los bloqueantes y altos quedaron resueltos). Las decisiones están en [decisiones.md](decisiones.md), el despliegue en [plan-despliegue.md](plan-despliegue.md), los fallos demostrables en [guion-fallos.md](guion-fallos.md) y los resultados de las pruebas de concepto en [poc-resultados.md](poc-resultados.md). Las referencias a "la propuesta" y "el análisis" son a `docs/propuesta-tecnica-v3.md` y `docs/analisis-pre-desarrollo.md`, que solo existen en local.

| Archivo | Contenido | Cuándo cambia |
|---|---|---|
| `plan-desarrollo.md` | Este documento | Al cerrar cada fase |
| `decisiones.md` | D01–D49 e I1–I5 con su estado | Cuando se reabre una decisión o se cierra una PoC |
| `plan-despliegue.md` | Despliegue multinube y costos | F3b y F11 |
| `guion-fallos.md` | Escenarios de fallo y sus scripts | Al cerrar cada hito; se usa en la defensa |
| `poc-resultados.md` | Resultado de cada PoC | F2 y F3a |


---

## 1. Contexto, supuestos y duración

### 1.1 Contexto
- Hay que construir la propuesta 3.1 con los ajustes del análisis.
- Lo hace una sola persona con asistentes, en orden de dependencias y riesgo.
- **Nivel 0 (nunca se recorta):**
  - multinube con CI/CD;
  - saga con sus fallos (5.3) e intervención (5.13);
  - coreografía con sus fallos (requisito 17);
  - los 18 requisitos en su versión mínima, más MCP.
- Estado del repo: `main` y `develop` con README, AGENTS.md, CLAUDE.md, `.gitignore` y `specs/000-convenciones.md`. No hay remoto todavía; `docs/` es local.

### 1.2 Supuestos

| # | Supuesto |
|---|---|
| P1 | Una jornada son 6 a 8 horas efectivas con asistente, pruebas incluidas |
| P2 | El usuario pidió **plan completo sin limitarse por fechas**: I1 e I2 quedan "no dados", no se aplica recorte desde el día 0 y Azure se crea al inicio de F11 (jornada 50,5). La tabla 1.4 y T9.9 se activan solo si el usuario da la fecha más adelante |
| P3 | **Ninguna decisión vale hasta que el usuario la confirme en el chat (T0.1).** Las `confirmada-sujeta-a-PoC` se cierran en F2 o F3; cualquier cambio queda en `decisiones.md` |
| P4 | Revisión de cada PR por un agente revisor. Merge a `develop` con `ci-ok` en verde; hasta que T3a.5 cree `ci-ok`, basta la revisión |
| P5 | Commits sin coautoría ni firmas (AGENTS.md y 000 §12) |
| P6 | Ramas `<tipo>/<pieza>/<que-se-hizo>` desde `develop`, publicadas con `git push -u` y con PR a `develop` |
| P7 | **Excepción declarada** (se escribe en T0.3 y T0.5): las ramas `chore/<pieza>/poc-*` no se mergean. Lo que sirve (realm, resultados) entra por otra rama. Las ramas de PoC se borran, en local y en el remoto, al cerrar H2 |
| P8 | La **primera versión** de un contrato va en su propio PR antes del código: temporal, eventos y OpenAPI del núcleo en F1; `analitica.yaml` en F8; GraphQL en F9. **Todo cambio posterior** va en el mismo PR que sus productores y consumidores (000 §12) |
| P9 | **Promoción de `develop` a `main` solo al cerrar los hitos H3, H5, H7, H9, H10 y H11**, más las promociones necesarias para poner a punto los pipelines durante F3b y T9.9, y los arreglos durante F11 y F12. Cada promoción sigue `encender-demo.sh` → despliegue → smoke → `apagar-demo.sh` (salvo en F11 y F12) |
| P10 | Hasta que Keycloak exista en la nube: `/health` y `/health/ready` no dependen de Keycloak, y los endpoints de negocio responden 503 `DEPENDENCIA_NO_DISPONIBLE` si `OIDC_ISSUER` está vacío |

### 1.3 Duración (base del revisor, colchón de 20 %)

| Fase | Jornadas | Acumulado | Hito |
|---|---|---|---|
| F0 Confirmación y remoto | 0,5 | 0,5 | H0 |
| F1 Specs y contratos del núcleo | 2 | 2,5 | H1 |
| F2 Pruebas de concepto: PoC-1 1, realm 0,5, PoC-2 1,5, PoC-3 0,5, PoC-4 1 | 4,5 | 7 | H2 |
| F3a Base local: compose con OTel 1, esqueletos 1,5, CI 0,5, calidad y generación de código 0,25 (§15) | 3,25 | 10,25 | — |
| F3b Esqueleto en la nube: AWS 1,5, GCP 1,5 | 3 | 13,25 | H3 |
| F4 Saga | 5 | 18,25 | H4 |
| F5 Inicio de viaje y coreografía (incluye 0,5 de multipart, D40) | 4,5 | 22,75 | H5 |
| F6 Portal (incluye Style Dictionary y Storybook, 0,5; §15) | 3 | 25,75 | H6 |
| F7 App del chofer (incluye 0,25 de multipart, D40, y 1 de push, D45) | 8,25 | 34 | H7 |
| F8 Analítica, simulador de viaje y reinicio de demo | 5 | 39 | H8 |
| F9 Gateway y 4 apps Angular (incluye Storybook de ui-comun, 0,5; §15) | 7,5 | 46,5 | H9 |
| F10 MCP, agente y voz (incluye la micro-PoC de Whisper web, 0,25) | 4 | 50,5 | H10 |
| F11 Despliegue multinube | 5 | 55,5 | H11 |
| F12 Fallos en la nube y ensayo | 2,5 | 58 | H12 |
| **Plan completo con colchón (×1,2)** | — | **69,6** | — |
| **Con nivel 1 (−3,5 j) y colchón** | 54,5 × 1,2 | **65,4** | — |
| **Con niveles 1 y 2 (−9,5 j) y colchón** | 48,5 × 1,2 | **58,2** | — |

Si se activa T9.9 (Azure temprano), F9 pasa a 9,5 j y F11 a 3 j; el total no cambia y el control por fase usa esos valores.

### 1.4 Regla de recorte desde el día 0

Jornadas disponibles = (semanas entre hoy e I1) × I2.

| Jornadas disponibles | Qué se hace |
|---|---|
| 69,6 o más | Plan completo |
| 65,4 a 69,6 | Nivel 1 desde el día 0 |
| 58,2 a 65,4 | Niveles 1 y 2 desde el día 0 |
| Menos de 58,2 | No cabe sin tocar el nivel 0. Se habla con el usuario (por ejemplo, para reducir el colchón) |

**Control al cerrar cada fase.** Si el atraso pasa del 15 %, se aplica el siguiente nivel. Si al cerrar F9 pasa del 20 %, F11 se adelanta a F10.

---

---

## 2. F0: confirmación de decisiones (0,5 j). Bloqueo explícito

**Bloqueo:** T0.1 es la primera tarea del plan. No se crea el remoto ni ninguna rama hasta que el usuario responda en el chat.

| Tarea | Rama | Entregable | Hecho cuando |
|---|---|---|---|
| T0.1 **Confirmación del usuario en el chat** (con los costos a la vista) | — | Se presenta la tabla de costos estimados, marcados "verificar en la calculadora": EC2 t3.medium unos 0,042 USD/h; EBS gp3 de 30 GB unos 2,4 USD/mes; IPv4 pública unos 3,6 USD/mes aunque la VM esté apagada; egreso; DynamoDB 0 USD dentro de 25 WCU/RCU; worker pool de Cloud Run encendido todo el día (unos 40 a 50 USD/mes: **se apaga fuera de pruebas**); 4 Container Apps con mínimo 1; B1MS 0 USD por 12 meses; GPU T4 por segundo; L4 unos 0,67 USD/h; Atlas M0 0 USD; Firebase 0 USD. El usuario responde I1–I5 y D01–D49 | Cada decisión queda `confirmada`, `cambiada` o `confirmada-sujeta-a-PoC` |
| T0.2 Crear el remoto | — (configuración) | Repo en GitHub con la visibilidad de D44, push de `main` y `develop`, `develop` por defecto, **`main` y `develop` protegidas (solo PR)** | `git remote -v` apunta a GitHub |
| T0.3 Registrar las decisiones y actualizar 000 | `docs/specs/decisiones-fase0` | `specs/decisiones.md` y cambios en 000: §1 (1:1, D03); §4.1 (excepción de `POST /servicios`, D43); §5 (códigos nuevos); §7 (retención y `parametrosSaga`); §10 (D23); §12 (excepción de PoC, P7) | PR mergeado y ningún "Pendiente" en 000 |
| T0.4 Publicar el plan | `docs/specs/plan-desarrollo` | Los otros 4 archivos (`decisiones.md` va en T0.3), con la tabla de costos de T0.1 en `plan-despliegue.md` | PR mergeado |
| T0.5 Actualizar AGENTS.md | `docs/repo/agents-piezas-poc` | Piezas `design-tokens` e `intercambio-token`, excepción de PoC, regla "el realm solo lleva `${...}`" | PR mergeado |

T0.1 quedó respondida el 28/10/2026; los datos de entrada y las 49 decisiones están en [decisiones.md](decisiones.md).

---

## 3. Fases

**Definición de hecho:** spec en `implementado`, contrato en el mismo PR, CI en verde, script en `plataforma/scripts/demo/`, README y `.env.example` al día, PR mergeado.

### F1: Specs y contratos del núcleo (2 j). Empieza solo después de T0.1

| Tarea | Rama | Entregable | Hecho cuando |
|---|---|---|---|
| T1.1 Specs 001, 002, 003, 004, 011 y 012 | `docs/specs/nucleo-saga` | Valores D01–D20 y D43; tabla de transiciones del `Viaje`. En 011: "Marcar como resuelto" deja el viaje `CANCELADO` y publica `ViajeCancelado` con `origen = SAGA`, y los consumidores liberan cuando su dependencia vuelve (sin paso manual) | El revisor no encuentra contradicciones |
| T1.2 Contrato Temporal | `feat/contratos/temporal-programar-viaje` | `contratos/temporal/programar-viaje.md` (con `parametrosSaga`) y ejemplos JSON | Esquema y ejemplo por actividad |
| T1.3 Eventos v1 | `feat/contratos/eventos-v1` | Sobre, los 19 eventos (catálogo cerrado, con `kmRecorridos`), AsyncAPI, colas y DLQ | `ajv` y `asyncapi validate` sin errores |
| T1.4 OpenAPI del núcleo | `feat/contratos/openapi-nucleo` | Viajes (clientes, servicios, cancelación, señales, rutas), Finanzas (cotizaciones, líneas, solicitudes) y Flota (lectura) | `spectral` sin errores |
| T1.5 Rehacer F11b (local) | — | PlantUML | Sin commit |

**H1.** Riesgo: sobrediseño. Los eventos se escriben completos porque el catálogo ya está cerrado; OpenAPI y GraphQL se escriben a tiempo en cada fase.

### F2: Pruebas de concepto (4,5 j)

Criterios en la sección 7. Orden: PoC-1 → T2.2 → PoC-2 → PoC-4 → PoC-3.

| Tarea | Rama | Entregable |
|---|---|---|
| T2.1 PoC-1 Keycloak | `chore/plataforma/poc-keycloak` (no se mergea) | Resultado |
| T2.2 Realm definitivo | `feat/plataforma/realm-keycloak` | `plataforma/keycloak/realm-transporte.json` **solo con `${KC_SECRETO_*}` y `${KC_CLAVE_*}`** (K2–K5, D26, D27), aplicado con keycloak-config-cli y sustitución de variables; `demo-cli` (D39); README con **solo** las contraseñas locales |
| T2.3 PoC-2 Temporal | `chore/plataforma/poc-temporal` | Resultado |
| T2.4 PoC-4 app nativa | `chore/app-chofer/poc-nativo` | Resultado (D22, D38) |
| T2.5 PoC-3 Ollama | `chore/plataforma/poc-ollama` | Resultado (D36) |
| T2.6 Resultados | `docs/specs/poc-resultados` | `specs/poc-resultados.md` y estados de D22, D29, D36 y D38 |

**H2:** ningún riesgo A queda abierto y las ramas de PoC están borradas.

### F3a: Base local (3,25 j)

| Tarea | Rama | Entregable | Hecho cuando |
|---|---|---|---|
| T3a.0 Ajustes de `.gitignore` | `chore/repo/gitignore-ajustes` | `!.env.demo`; cambiar `models/` por rutas ancladas (`/movil/app-chofer/assets/modelos/`, `/frontends/**/public/modelos/`); `*.joblib` sigue ignorado porque se entrena en el build | `git check-ignore` da lo esperado |
| T3a.1 Compose | `chore/plataforma/compose-local` | Sección 8: perfiles; inicializaciones (Mongo `rs0`, DynamoDB Local, MinIO, `definitions.json` de RabbitMQ, namespace de 30 días, bases); `extra_hosts: ["<mac>.local:host-gateway"]`; OTel Collector y Jaeger (`trazas`); Mailpit (`plataforma`); `.env.example` y `.env.demo` sin secretos; `CORS_ORIGENES`. Incluye **PoC-5** (medir memoria) | `--profile core --profile plataforma` sano y memoria medida |
| T3a.2 Esqueleto de Viajes | `feat/viajes/esqueleto` | Hexagonal, ArchUnit, Flyway (tablas comunes), relay del Outbox, Problem Details, correlación, SDK de OTel, regla P10, CORS | `mvn verify` |
| T3a.3 Esqueleto de Flota | `feat/flota/esqueleto` | Clean, dependency-cruiser, `main.ts` y `worker.ts`, Outbox con transacción Mongo, OTel, P10 | Jest |
| T3a.4 Esqueleto de Finanzas | `feat/finanzas/esqueleto` | DDD, Deptrac, Pest, Larastan; Octane con 4 workers; `.rr.yaml` según D29; `Monto`; OTel; P10 | Pest y Deptrac |
| T3a.5 CI de PR | `ci/ci/pipelines-pr` | `ci.yml` con `paths-filter` y un job agregador `ci-ok`; job **gitleaks** con una regla que falla si `plataforma/keycloak/**` trae un secreto literal (sin `${`); `contratos.yml`; **commitlint** sobre los commits del PR (Conventional Commits y regla que rechaza `Co-Authored-By`) dentro de `ci-ok` | `ci-ok` es el *required check* |

### F3b: Esqueleto en la nube (3 j)

| Tarea | Rama | Depende de | Entregable | Hecho cuando |
|---|---|---|---|---|
| T3b.1 Base de AWS | `feat/plataforma/vm-aws` | T3a | Cuenta (D41) y Budgets; `plataforma/aws/crear-recursos.sh`; EC2; CA propia; `plataforma/vm/compose.yaml` (Temporal con mTLS, AMQPS y MQTTS, Caddy solo para Viajes); DynamoDB 20/5; S3; ECR; rol OIDC; SSM | Temporal acepta mTLS desde la Mac |
| T3b.2 Pipeline de Viajes | `ci/ci/deploy-viajes-aws` | T3b.1 | `viajes.yml` y `_deploy-ec2.yml` | Smoke `/health` por HTTPS |
| T3b.3 Base de GCP | `feat/plataforma/gcp-base` | T3b.1 (certificados) | Cuenta de pago (D42) y presupuesto; WIF; Artifact Registry; Atlas M0 con lista de acceso `0.0.0.0/0` y usuario fuerte (las IP de salida de Cloud Run cambian); 5 sitios de Firebase; pedido de cuota de GPU | Recursos creados |
| T3b.4 Pipelines de Flota y Firebase | `ci/ci/deploy-flota-gcp` | T3b.3 | `flota.yml` (servicio y worker pool), `_deploy-firebase.yml` con un sitio "hola" | La Temporal UI (por túnel) muestra el worker de `flota` |
| T3b.5 Encender y apagar | `feat/plataforma/scripts-encender-apagar` | T3b.2, T3b.4 | `encender-demo.sh` y `apagar-demo.sh` (EC2, worker pool y luego Container Apps) | **Después de H3, la EC2 queda detenida y el worker pool en 0** |

**H3:** primera promoción a `main` (P9). Un push despliega solo lo que cambió.

### F4: Saga (5 j)

| Tarea | Rama | La precede | Entregable |
|---|---|---|---|
| T4.1 Alta de cliente | `feat/viajes/alta-cliente` | 001 | `POST /api/v1/clientes`, FGAP v2, reintentar vinculación, `comercial`, rutas, eventos |
| T4.2 Cotizar | `feat/finanzas/cotizar` | 002 | Inbox con `versionAgregado`, línea D01, tarifas D10, vigencia `PT24H` (demo `PT2M`, que es configuración de la API y no del workflow) |
| T4.3 Workflow | `feat/viajes/programar-viaje` | 003 | `POST /api/v1/servicios` (S1, S2, S3, D43), workflow con `parametrosSaga`, consulta `estado`, `GET .../servicios/{id}` con su `etapa`, *replay* (S16) |
| T4.4 Actividades de Finanzas | `feat/finanzas/actividades-saga` | 003, 012 | Orden: cotización → disponible → mora o monto alto; `PENDIENTE_APROBACION`; `SolicitudAprobacion` |
| T4.5 Actividades de Flota | `feat/flota/reservas-saga` | 003 | Atributos variables; reserva atómica e idempotente |
| T4.6 Señales | `feat/viajes/senales-saga` | 011, 012 | Endpoints de aprobación e intervención; `ViajeRequiereIntervencion` |
| T4.7 Cancelación | `feat/viajes/cancelar-servicio`, `feat/finanzas/liberar-por-cancelacion`, `feat/flota/liberar-por-cancelacion` | 004 | D17, D18 |
| T4.8 Semilla con fechas relativas | `feat/plataforma/semilla-demo` | — | Clientes "Agro Moroso" (límite 30.000, factura de 5.000 vencida hace 20 días, disponible 25.000), "Ferretería Sin Crédito" (límite 5.000) y "Agroexport" (facturas que vencen en los próximos 7 días); rutas con Arica y Aula; 5 tractos; 3 furgones, uno con 9.950 km; 2 plataformas; 1 cisterna en `MANTENIMIENTO_PENDIENTE`; 4 choferes |
| T4.9 Pruebas y scripts | `test/viajes/fallos-saga` | — | `TestWorkflowEnvironment` con los 7 fallos y la intervención; `saga-*.sh`, incluido `saga-compensacion-agotada.sh` (FS8) |

**H4:** FS1–FS7, FS9 y FO3 por curl en local. FS8 llega a `REQUIERE_INTERVENCION`, con `ViajeRequiereIntervencion` publicado (se ve en la cola) y resolución por curl. La alerta llega en H8 y la interfaz en H9. Hasta F8 la demo se reinicia con `docker compose down -v` y la semilla.

### F5: Inicio de viaje y coreografía (4,5 j)

Specs que van primero: la parte de inicio de la 005, 006, 007, 008, 009 y 010 (`docs/specs/coreografia`). En 010 se escriben D07 y `kmRecorridos`. **Los cambios de OpenAPI y eventos van dentro de cada PR** (P8).

| Tarea | Rama | Entregable |
|---|---|---|
| T5.0 Inicio de viaje | `feat/viajes/inicio-viaje` | `GET /api/v1/viajes/mios`, `POST /api/v1/viajes/{viajeId}/inicio` y `ViajeIniciado` |
| T5.1 Entrega | `feat/viajes/entrega` | Multipart firmado (D40a), geocerca, `EntregaConfirmada`, `EntregaObservada` y `EntregaRechazada` con `kmRecorridos`, aprobar o rechazar la observada, `FacturaEmitida` → `CERRADO` |
| T5.2 Factura y cobro | `feat/finanzas/facturar-cobrar` | `FAC-000123`, consumir la reserva, liberar por rechazo, pagos con `abonar()`, `PagoRegistrado`, monto negativo rechazado |
| T5.3 Flota | `feat/flota/combustible-mantenimiento` | `EN_VIAJE` por `ViajeIniciado` (D20); liberar la unidad; sumar km (D07); 5.12; cargas con `opId`; sensor (D30); `CaidaCombustibleDetectada`; `ChoferActualizado` |
| T5.4 Simulador de combustible | `feat/plataforma/simulador-combustible` | Escenarios `normal` y `robo`; `mqtt://` en local y **`mqtts://` con la CA propia** hacia la EC2 |
| T5.5 n8n factura | `feat/plataforma/n8n-avisos` | Flujo `factura-emitida` con Inbox en Postgres y Mailpit |
| T5.6 Toxiproxy | `chore/plataforma/toxiproxy-fallos` | Proxies y `scripts/fallos/*.sh` ([guion-fallos.md](guion-fallos.md)) |

**H5** (promoción): por scripts, inicio → entrega → factura → cierre → correo. Además FC1, FC2, FC4 y FF3; FF1 hasta el evento publicado; FC3 y FC5 en local.

### F6: Portal (3 j)

| Tarea | Rama | Entregable |
|---|---|---|
| T6.1 Tokens de diseño | `feat/design-tokens/variables-base` | `libs/design-tokens` con Style Dictionary (un JSON → variables CSS, tema MUI, tema de Angular Material y tema de React Native Paper); Storybook del portal (§15) |
| T6.2 Alta y cotizar | `feat/portal-cliente/alta-y-cotizar` | OIDC con refresh token; registro; datos de la empresa; reintentar vinculación; cotizar |
| T6.3 Confirmar y seguir | `feat/portal-cliente/confirmar-y-seguir` | Clave por intento; "En aprobación"; cancelar; seguimiento; POD |
| T6.4 Facturas, comercial y offline | `feat/portal-cliente/facturas-y-offline` | Facturas, saldo y crédito; modo comercial; caché PWA |

**H6:** pasos 1 a 3 del escenario, más FS1, FS2 y FS7 desde el portal.

### F7: App del chofer (8,25 j)

La spec 005 se completa primero, con esta regla: si el viaje se canceló mientras el chofer registraba el inicio sin señal, al sincronizar responde 409 `CONFLICTO_ESTADO` y la app muestra "Viaje cancelado; llama al despachador".

| Tarea | Rama | Entregable |
|---|---|---|
| T7.1 Ruta en Viajes | `feat/viajes/viaje-en-ruta` | Lotes de GPS (25 por llamada, `UnprocessedItems`, 503 con `Retry-After`), `ultima_posicion`, `PosicionActualizada`, bitácora, `EventoConduccionRegistrado`, `sync_cursor`; **prueba con *throttling* simulado (FO4)** |
| T7.2 Cola y sincronización | `feat/app-chofer/cola-sincronizacion` | Clean, autenticación con `offline_access`, SQLite con Drizzle, cola, motor de sincronización, `APP_ENTORNO` |
| T7.3 GPS y sensores | `feat/app-chofer/gps-sensores` | GPS en segundo plano; frenadas (D08) |
| T7.4 Bitácora por voz | `feat/app-chofer/bitacora-voz` | whisper.rn (modelo descargado al build) |
| T7.5 Entrega | `feat/app-chofer/entrega` | Foto, firma, rechazo, multipart que reanuda por parte |
| T7.6 Combustible | `feat/app-chofer/combustible` | Carga con foto |
| T7.7 Fatiga | `feat/app-chofer/detector-fatiga` | TFLite en primer plano |
| T7.8 Notificaciones push (D45) | `feat/viajes/notificador-push`, `feat/app-chofer/notificaciones-push` | Registro del token, adaptador FCM en Viajes, canal de notificaciones en Android, abrir el viaje al tocar la notificación; prueba en el emulador de Android (1 j) |

**H7** (promoción): FO1, FO2, FO5 (solo el estado `ENTREGA_OBSERVADA`), FO6 y FO7 en el iPhone; push de "viaje asignado" y "viaje cancelado" en el emulador de Android (D45).

### F8: Analítica (5 j)

| Tarea | Rama | Entregable |
|---|---|---|
| T8.0 Spec 013 y contrato | `docs/specs/alertas`, `feat/contratos/openapi-analitica` | Primera versión de `analitica.yaml` |
| T8.1 Modelo de lectura | `feat/analitica/modelo-lectura` | Inbox de todos los eventos; hechos; `HechoConduccion` con puntaje por cada 100 km |
| T8.2 Alertas | `feat/analitica/alertas` | Fuentes de 5.14 más `EntregaObservada`; roles; cursor |
| T8.3 Reportes | `feat/analitica/reportes-excel` | 5 reportes; Excel para el Gateway (D21) |
| T8.4 ML | `feat/analitica/ml-retraso-anomalias` | Notebook; `.joblib` **entrenado en el build** con semilla fija (la imagen de Analítica se construye con contexto en la raíz del repo para leer `plataforma/datos-sinteticos`); Isolation Forest |
| T8.5 Datos sintéticos | `feat/plataforma/datos-sinteticos` | 3 meses de hechos con fechas relativas |
| T8.6 Acciones y aviso | `feat/analitica/acciones-propuestas`, `feat/plataforma/n8n-aviso-cliente` | Estados de la acción; `AvisoClienteAprobado` con relay en Python; **flujo n8n `aviso-cliente`** |
| T8.7 Simulador de viaje | `feat/plataforma/simulador-viaje` | Segundo viaje con chofer2 (token por *device grant* en la nube): GPS, hitos de bloqueo y retraso, para llegar a un riesgo de 0,70 o más |
| T8.8 Reinicio y escenario | `feat/plataforma/reiniciar-demo` y `feat/<pieza>/reiniciar-demo` en viajes, flota, finanzas y analitica | `reiniciar-demo.sh [--nube]`: corre `demo:reiniciar` en cada servicio (vuelve a la semilla con fechas relativas), borra al cliente del paso 1 en Keycloak, purga las colas y termina los workflows abiertos. `demo:reiniciar` es **un comando** (artisan, CLI de Spring, CLI de Nest, script de Python), **nunca un endpoint**. En la nube: `docker compose exec` por SSM en la EC2 (Viajes, `temporal workflow terminate`, `rabbitmqctl purge_queue`), Container Apps Jobs en Azure (Finanzas, Analítica y el Job `keycloak-config`, que también borra el usuario) y un Cloud Run Job en GCP (Flota). `escenario-completo.sh [--nube]` crece en cada hito |

**H8:** alertas de FS8, FO5, FF1 y FF2; rentabilidad uniendo 3 servicios; riesgo de 0,70 o más con el simulador.

### F9: Gateway y Centro de Control (7,5 j)

| Tarea | Rama | Entregable |
|---|---|---|
| T9.1 Esquema GraphQL | `feat/contratos/graphql-centro-control` | Consultas de pantallas; mutaciones `cancelarServicio`, `aprobarEntregaObservada`, `rechazarEntregaObservada`, `programarMantenimiento` y `cerrarMantenimiento`; **`aprobarCredito(servicioId, aprobado, motivo)`**; `exportarReporte` según D21. Primera versión de `contratos/openapi/gateway.yaml` con `GET /exportaciones/{id}` |
| T9.2 Intercambio de tokens | `feat/intercambio-token/biblioteca` | `libs/intercambio-token` |
| T9.3 Gateway | `feat/gateway/composicion` | DataLoader, límites, permisos por campo, respuesta parcial, suscripción (cierre 4401, 3600 s), `GET /exportaciones/{id}`, `CORS_ORIGENES` |
| T9.4 `ui-comun` | `feat/ui-comun/base-sso` | Angular 22 (verificar TS 6), OIDC, barra con disponibilidad, campana con reconexión, renovación al volver a la pestaña |
| T9.5–T9.8 Las 4 apps | `feat/cc-tablero/tablero-reportes`, `feat/cc-operaciones/operacion`, `feat/cc-flota/flota`, `feat/cc-finanzas/finanzas` | Las pantallas de 6.1; borrador en cc-flota; OCR en cc-finanzas |
| T9.9 Azure temprano (condicional; **inactiva mientras I1 no esté dada**) | Las de T11.1–T11.4 | Si al empezar F9 quedan **30 días naturales o menos** hasta la defensa, se crea Azure aquí y se despliegan B1MS, Keycloak y Finanzas. El total no cambia: F9 pasa a 9,5 j y F11 a 3 j (1.3) |

**H9** (promoción): FS3 y FS8 desde la interfaz; FK1–FK3; FR1 y FR2 en local; FC6.

### F10: MCP, agente y voz (4 j)

Primero las specs 014 y 015 (`docs/specs/agente-voz`) y la micro-PoC de Whisper web. Los cambios de `analitica.yaml` y GraphQL van en los PR de código.

| Tarea | Rama | Entregable |
|---|---|---|
| T10.1 Servidor MCP | `feat/mcp-server/herramientas` | 8 herramientas, recursos, prompts y seguridad de §8 de la propuesta |
| T10.2 Agente | `feat/analitica/agente-vigilar-viajes` | D09; traza; misión saltada si no hay LLM |
| T10.3 Voz en Analítica | `feat/analitica/reportes-voz` | Intención validada; `ejecutar_reporte`; plan B del intercambio (K1) |
| T10.4 cc-tablero | `feat/cc-tablero/voz-y-agente` | Whisper en un Web Worker y panel del agente |
| T10.5 Inspector en CI | `ci/ci/inspector-mcp` | `tools/list` (verificar la especificación 2026-07-28) |

**H10** (promoción): FM1–FM4 y FR4.

### F11: Despliegue multinube (5 j)

| Tarea | Rama | Depende de | Hecho cuando |
|---|---|---|---|
| T11.1 Cuenta de Azure, pago por uso, presupuesto y cuota de GPU | — (configuración) | H10, o T9.9 | Alertas activas y cuota de GPU visible |
| T11.2 B1MS con 4 bases y un usuario por base | `feat/plataforma/postgres-b1ms` | T11.1 | Conexión TLS desde Container Apps |
| T11.3 Keycloak en Container Apps (K7). El realm se aplica con keycloak-config-cli corriendo como **Container Apps Job `keycloak-config`**, que recibe los `KC_SECRETO_*`, `KC_CLAVE_*` y la contraseña de administración desde los secretos de Container Apps. El pipeline solo lo dispara (`az containerapp job start`, con identidad federada) y espera su resultado: ningún secreto pasa por GitHub. Keycloak con pool de 7 conexiones | `feat/plataforma/keycloak-nube`, `ci/ci/deploy-keycloak` | T11.2 | `/.well-known/openid-configuration` responde, entra un usuario por rol, y volver a aplicar el realm cambia lo que debe |
| T11.4 Finanzas API y worker (`maxReplicas = 1`) | `ci/ci/deploy-finanzas-azure` | T11.3 | El worker aparece en la cola `finanzas`; consumidores conectados por AMQPS |
| T11.5 Analítica (`maxReplicas = 1`) | `ci/ci/deploy-analitica-azure` | T11.3 | Una sola misión por intervalo |
| T11.6 n8n (`maxReplicas = 1`), flujos importados por su API | `feat/plataforma/n8n-nube`, `ci/ci/deploy-n8n` | T11.2 | Llega un correo real |
| T11.7 LLM con GPU | `feat/plataforma/llm-gpu` | T11.1 | Responde en menos de 10 s ya despierto; no está expuesto sin autenticación |
| T11.8 Gateway y MCP en Cloud Run | `ci/ci/deploy-gateway-mcp` | T11.5, T11.11 | La suscripción funciona; el Inspector funciona contra la nube |
| T11.9 Las 5 apps, `CORS_ORIGENES` y Web Origins en el realm, modelos servidos | `ci/ci/deploy-firebase` | T11.8 | Salto de SSO en la nube |
| T11.10 EC2: `pg_dump` diario a S3 y túnel SSM para la Temporal UI y la consola de RabbitMQ | `feat/plataforma/vm-respaldos-auth` | — | Hay respaldo en S3; los puertos 8233 y 15672 no son accesibles desde internet |
| T11.11 Configuración de AWS y GCP (`OIDC_ISSUER`, URLs, CORS) y semilla en la nube | `chore/plataforma/config-nube` | T11.3 | `reiniciar-demo.sh --nube` en verde |
| T11.12 Escenario en la nube | `test/plataforma/escenario-nube` | Todas | `escenario-completo.sh --nube` en verde y `pg_stat_activity` con 35 conexiones o menos |

Pools en B1MS: Keycloak 7, n8n 5, Finanzas 8 (Octane 4, más RoadRunner con 2 de Temporal y 2 servicios) y Analítica 5. Total 25. Durante un redespliegue de Container Apps conviven dos réplicas un momento: el peor caso (Keycloak o Finanzas duplicados) da 33, dentro de las ~35 útiles. T11.12 lo mide también durante un redespliegue.

**H11:** escenario de 10 pasos en la nube y FCI1.

### F12: Ensayo (2,5 j)

| Tarea | Rama | Entregable |
|---|---|---|
| T12.1 Fallos en la nube | `docs/specs/guion-fallos-nube` | Todo el guion en `listo nube`. Puntos de GPS con TTL vencido sembrados al menos 3 días antes de la defensa |
| T12.2 Grabaciones | — | Un video por demostración |
| T12.3 README final | `docs/repo/readme-final` | Arranque, puertos, **contraseñas solo locales**, licencias, limitaciones |
| T12.4 Cambios para ICONIX | `docs/specs/cambios-iconix` | Lista de cambios de estructura; F10a y F10b en local |

---

## 4. Escenario de punta a punta (propuesta §1)

| Paso | Tareas | Datos | Local | Nube |
|---|---|---|---|---|
| 1 Alta del cliente | T4.1, T6.2 | Usuario nuevo (el reinicio lo borra) | F6 | F11 |
| 2 Cotiza | T4.2, T6.2 | Ruta Aula, 28 t de granos = 2.800 BOB | F6 | F11 |
| 3 Confirma y corre la saga | T4.3–T4.5, T6.3 | Furgón y chofer1 libres | F6 | F11 |
| 4 Sale sin señal: GPS, voz, frenadas, fatiga y sensor | T5.0, T7.x, T5.4 (`mqtts`) | chofer1 en el iPhone | F7 | F11 |
| 5 Sincroniza por lotes | T7.2 | — | F7 | F11 |
| 6 Entrega → factura, unidad, cierre y correo | T5.1–T5.3, T5.5, T7.5 | Geocerca del Aula | F7 | F11 |
| 7 Anomalía de diésel y retraso de otro viaje | T8.1, T8.4, T8.7 | Carga exagerada; simulador con chofer2 | F8 | F11 |
| 8 Agente, aprobación y aviso | T10.2, T9.6, T8.6 | Viaje del paso 7 | F10 | F11 |
| 9 Voz: cuentas por cobrar de esta semana y Excel | T10.3, T10.4, T8.3, T9.3 | Facturas de Agroexport que vencen en 7 días o menos | F10 | F11 |
| 10 Registrar pago y liberar crédito | T5.2, T9.8 | Factura del paso 6 | F9 | F11 |

`escenario-completo.sh` recorre por API los pasos que ya existen y corre en cada hito. Los pasos de interfaz se ensayan a mano. Antes de cada ensayo se corre `reiniciar-demo.sh`.

---

## 5. Specs y contratos: cuándo

| Documento | Fase |
|---|---|
| 000 (cambios de T0.3) | F0 |
| 001, 002, 003, 004, 011, 012; temporal; eventos v1; OpenAPI del núcleo | F1 |
| 005 (parte de inicio), 006–010 | Inicio de F5 |
| 005 completa | Inicio de F7 |
| 013 y `analitica.yaml` v1 | Inicio de F8 |
| GraphQL v1 | Inicio de F9 |
| 014 y 015 | Inicio de F10 |

**Códigos nuevos en 000 §5:**

| Código | Estado |
|---|---|
| `TONELAJE_EXCEDIDO` | 422 |
| `APROBACION_VENCIDA` | 422 |
| `CONFIRMACION_EN_CURSO` | 409 |
| `CANCELACION_NO_PERMITIDA` | 409 |
| `VINCULACION_PENDIENTE` | 503 |
| `LLM_NO_DISPONIBLE` | 503 |
| `PREGUNTA_FUERA_DE_ALCANCE` | 422 |

---

## 6. Hallazgos del análisis → tareas

**Resumen del análisis (1 a 10)**

| # | Resolución |
|---|---|
| 1 | D01 → T4.2 |
| 2 | D02 → T4.2, T4.4 |
| 3 | D03 → T4.3 |
| 4 | T1.2 |
| 5 | PoC-1 |
| 6 | D17 → T4.7 |
| 7 | D19, D20 → T1.3 |
| 8 | PoC-5 en T3a.1 |
| 9 | T0.2 (remoto); el resto ya existe |
| 10 | T1.5 (F11b), T12.4 (F10a y F10b) |

**Saga**

| # | Resolución | Tarea |
|---|---|---|
| S1, S2 | La tabla es la autoridad y `REJECT_DUPLICATE` la defensa adicional; D43 | T4.3 |
| S3 | Clave por intento | T6.3 |
| S4 | `PENDIENTE_APROBACION` | D16, T4.4 |
| S5 | Señal por Gateway → Viajes | T4.6, T9.8 |
| S6 | `SolicitudAprobacion` | T4.4 |
| S7, S8 | D15 (decisiones.md, sección 3) | D15 |
| S9 | Lista cerrada de errores | T1.2, PoC-2 |
| S10 | D02 | — |
| S11 | Relectura en el paso 3 | T4.5 |
| S12 | D17 | — |
| S13 | D18 | T4.7 |
| S14 | Nombres explícitos | T1.2 |
| S15 | Fixtures compartidos | PoC-2, T4.9 |
| S16 | `getVersion` y *replay* | T4.3 |

**Keycloak**

| # | Resolución | Tarea |
|---|---|---|
| K1 | PoC-1; plan B de 2 saltos | T10.3 |
| K2, K3 | Scopes de audiencia; roles por defecto vacíos | T2.2 |
| K4 | FGAP v2 sobre el grupo `registro-portal` | PoC-1 |
| K5 | D12 | T2.2 |
| K6 | D26 | — |
| K7 | Proxy y hostname | T11.3 |

**Eventos y reglas transversales**

| Tema | Resolución | Tarea |
|---|---|---|
| Eventos faltantes (5.1) | D19 | T1.3, T5.1, T7.1 |
| Orden con `versionAgregado` | — | T4.2 |
| DLQ | — | T3a.1 |
| Relays del Outbox | — | T3a.2–T3a.4, T8.6 |
| Inbox de n8n | — | T5.5 |
| Datos para n8n | — | T1.3 |
| MQTT a AMQP | D30 | — |
| Estados terminales | — | T1.1 |

**Supuestos técnicos (3.2)**

| Supuesto | Resolución | Tarea |
|---|---|---|
| Retención | S1 y D14 | — |
| RoadRunner | PoC-2 | D29 |
| Mongo en *replica set* | — | T3a.1 |
| Memoria de la Mac | PoC-5 | — |
| 25 WCU | Simulado | T7.1; FO4 |
| B1MS | Pools y `maxReplicas = 1` | T11.4–T11.6, T11.12 |
| Excel entre nubes | D21 | T8.3, T9.3 |
| Whisper y Tesseract sin red | Modelos propios | T9.8, T10.4 |
| Cierre de sesión | — | T9.4 |
| WebSocket | — | T9.3, T9.4 |
| Temporal UI | D28 | T11.10 |
| GPS y cámara en segundo plano | PoC-4 y limitación escrita | T12.3 |

**Versiones (análisis 7) y entornos (análisis 8)**

| Tema | Tarea |
|---|---|
| Angular con TypeScript 6 | T9.4 |
| Expo 57.0.9 o posterior | PoC-4 |
| Build de iPhone de 7 días | D22 |
| Jackson 3; Temporal con PostgreSQL 17 | PoC-2 |
| Inspector | T10.5 |
| Mailpit, DynamoDB Local, MinIO | T3a.1 |
| Variables por entorno | T3a.1 |
| Observabilidad (10.5) | D23 |

### 6.1 Hallazgos propios de este plan

| # | Hallazgo | Resolución |
|---|---|---|
| N1 | Nadie pasa la unidad a `EN_VIAJE` | D20 |
| N2 | Ruta de `ui-comun` | `projects/ui-comun` |
| N3 | Piezas que faltan en AGENTS.md | T0.5 |
| N4 | Mutaciones que faltan en GraphQL | T9.1 |
| N5 | *Required checks* con filtro por carpeta | `ci-ok` |
| N6 | `<mac>.local` | `extra_hosts`, ATS y CORS |
| N7 | Tokens para scripts | D39 |
| N8 | No se puede cancelar en 2b | Documentado en 004 |
| N9 | Toxiproxy fuera del camino | `.env.demo` |
| N10 | DynamoDB Local no borra por TTL | Demo del TTL en la nube |
| N11 | Solo amd64 en Cloud Run y Container Apps | CI construye amd64 |
| N12 | Modelos ignorados por `.gitignore` | T3a.0 |
| N13 | Enlaces del README a `docs/` | Solo locales |

### 6.2 Contradicciones resueltas (manda el análisis o 000)

1. Autoridad de `POST /servicios`: la tabla (S1, S2).
2. `workflowId = programar-viaje-<servicioId>`.
3. Mailpit en lugar de MailHog.
4. Sensor por AMQP.
5. Excel por el Gateway (D21).
6. Cierre de sesión por renovación del token.
7. Temporal UI por túnel (D28).
8. Relectura en el paso 3.
9. Estado `PENDIENTE_APROBACION`.
10. Dos procesos en el worker PHP.
11. `origen = SAGA`.
12. Ruta de `ui-comun` de la sección 12.
13. Revisión de contratos por un agente.
14. GCP se crea en F3b, con la regla de 9.1.
15. Jaeger en el perfil `trazas` (D23).
16. Excepción de idempotencia en `POST /servicios` (D43), que se escribe en 000 §4.1.
17. En la nube el realm se aplica con keycloak-config-cli, porque `--import-realm` se salta un realm que ya existe.
18. Portal: MUI reemplaza shadcn/ui + Tailwind y TanStack Router reemplaza React Router (propuesta 13.2), por pedido del usuario (D46, D48).
19. Viajes: openapi-generator (contrato primero) reemplaza a springdoc como fuente del contrato; springdoc queda solo como interfaz de documentación.

---

## 7. Pruebas de concepto

**PoC-1 Keycloak (1 j)**
- Qué se prueba: `clienteId` y su mapper; FGAP v2; cadena de 3 intercambios con K2; intercambio del token del agente en `mcp-server`; K3; SSO y cierre de sesión entre 2 SPA; **keycloak-config-cli con `${...}`**; *device grant* de `demo-cli`.
- Éxito: el tercer intercambio da 200 con el mismo `sub`; el cierre de sesión se detecta al volver a la pestaña.
- Plan B: 2 saltos; `manage-users` con el riesgo escrito; un realm generado por script.

**PoC-2 Temporal (1,5 j)**
- Qué se prueba: Java llama a PHP y TS con los fixtures del contrato; errores no reintentables; reinicio de workers; Jackson 3; reconexión de Laravel; plugin `service`; PostgreSQL 17.
- Plan B: worker PHP sin Laravel; PostgreSQL 16 para Temporal; supervisord.

**PoC-3 Ollama (0,5 j)**
- Éxito: 10 s o menos por turno y JSON válido en 9 de cada 10.
- Plan B: modelo `4b`.

**PoC-4 iPhone (1 j)**
- Qué se prueba: Expo 57.0.9 o posterior; whisper.rn; TFLite; GPS en segundo plano 10 min; SQLite; login por `<mac>.local`; Network Link Conditioner.
- Plan B: fotos en lugar de *frame processor*; grabar y transcribir; GPS en primer plano; Android.

**PoC-5 Memoria (dentro de T3a.1)**
- Qué se mide: los perfiles con Ollama según I3.
- Plan B: límites por contenedor; correr nativo solo el servicio en el que se trabaja.

**Micro-PoC de Whisper web (dentro de F10)**
- Éxito: la pestaña Red queda vacía al transcribir.

**PoC de despliegue (dentro de F3b)**
- Qué se prueba: OIDC, WIF, worker pool, mTLS entre nubes, sslip.io.
- Plan B: Cloud Run *service* con CPU siempre asignada; un dominio barato.

---

## 8. Entorno local

`plataforma/compose/compose.yaml`. Un servicio puede estar en varios perfiles.

| Perfil | Servicios |
|---|---|
| `core` | viajes, flota-api, flota-worker, finanzas-api, finanzas-worker, postgres-aws, postgres-azure, mongo, dynamodb-local, minio |
| `plataforma` | temporal, temporal-ui, rabbitmq, keycloak (con keycloak-config-cli), n8n, **mailpit**, postgres-aws, postgres-azure |
| `ia` | analitica, gateway, mcp-server (Ollama nativo) |
| `trazas` | otel-collector, jaeger. Los servicios exportan si `OTEL_EXPORTER_OTLP_ENDPOINT` (en `.env.example`) apunta al collector |
| `demo` | toxiproxy, mcp-inspector. Se usa con `--env-file .env.demo` para desviar conexiones |

Todos los contenedores llevan `extra_hosts: ["<mac>.local:host-gateway"]`.

**Mapa de puertos**

| Pieza | Puerto | Pieza | Puerto |
|---|---|---|---|
| Keycloak | 8080 | Temporal / UI | 7233 / 8233 |
| Viajes | 8101 | RabbitMQ | 5672, 15672, 1883 |
| Flota API | 8102 | postgres-aws / postgres-azure | 5432 / 5433 |
| Finanzas API | 8103 | Mongo | 27017 |
| Analítica | 8104 | DynamoDB Local | 8000 |
| Gateway | 4000 | MinIO | 9000, 9001 |
| MCP | 3100 | n8n | 5678 |
| cc-tablero … cc-finanzas | 4201–4204 | Mailpit | 8025, 1025 |
| portal-cliente | 5173 | Toxiproxy | 8474; 25433, 25672, 28103 |
| Metro | 8081 | Inspector | 6274, 6277 |
| Jaeger | 16686 | OTel Collector | 4317, 4318 |
| Ollama (nativo) | 11434 | — | — |

---

---

## 9. Despliegue multinube

Ver [plan-despliegue.md](plan-despliegue.md).

---

## 10. Fallos controlados

Ver [guion-fallos.md](guion-fallos.md).

---

## 11. Matriz de cumplimiento

| # | Requisito | Fase | Demostración |
|---|---|---|---|
| 1 | Microservicios | F3–F4, F11 | FR1 |
| 2 | Transacción distribuida | F1, F4 | FS1–FS8 |
| 3 | GraphQL | **F9 (local) y F11 (3 nubes)** | Tablero con datos de las 3 nubes; FR2 |
| 4 | Tres tipos de base | F4, F5, F7 | FF4 |
| 5 | Microfrontends | F6, F9, F11 | FCI1, FR3 |
| 6 | SSO | F2, F9 | FK1–FK3 |
| 7 | Arquitecturas | F3a | FCI2 y CQRS |
| 8 | 4 niveles | Todas | Reporte de rentabilidad |
| 9 | Sensores | F5, F7 | FO5, FF1 |
| 10 | IA local | F7, F9, F10 | FO6 y pestaña Red vacía |
| 11 | Offline | F6, F7, F9 | FO1 |
| 12 | Mala conexión | F5, F7 | FO2 y multipart (D40) |
| 13 | Sincronización idempotente | F4, F7 | FO3, FS7 |
| 14 | Agentes | F10 | FM2, FM3 |
| 15 | ML | F8 | Notebook; FF2 |
| 16 | Deep learning con imagen | F7 | FO6 |
| 17 | Automatización | F5, F8 | FC1, FC2, FM3 |
| 18 | Reportes generativos | F8, F10 | FM4 |
| + | MCP | F10 | FM1 |
| + | Multinube | F3b, F11 | FCI1 y escenario en la nube |

---

## 12. Línea de corte

**Nivel 0.** Ver 1.1.

**Nivel 1 (−3,5 j; se aplica desde el día 0 si 1.4 lo indica)**

| Recorte | Ahorro | Fase |
|---|---|---|
| D23: solo logs | 1 | F3a–F5 |
| *Front-channel logout* | 0,25 | F9 |
| Recorrido histórico en el mapa | 0,5 | F7, F9 |
| Pipeline de n8n (importación manual) | 0,25 | F11 |
| FC3, FC5 y FC6 | 0,5 | F5, F9 |
| Respaldo automático (`pg_dump` manual) | 0,25 | F11 |
| Pulido visual | 0,5 | F6, F9 |
| D21: Excel directo desde Analítica | 0,25 | F9 |

**Nivel 2 (−6 j)**

| Recorte | Ahorro |
|---|---|
| Fatiga mínima | 1 |
| Whisper `tiny` y OCR solo del monto | 0,5 |
| Un borrador y caché de 2 listas | 0,5 |
| **D40 (b), un archivo por URL: cambio de alcance que el usuario tiene que confirmar** | 0,75 |
| Regresión logística | 0,25 |
| Un solo tipo de acción del agente | 0,25 |
| Aclaración fija para la pregunta ambigua | 0,25 |
| 2 o 3 pantallas por app Angular | 1,5 |
| Puntaje de conducción simple | 0,25 |
| Modo comercial mínimo | 0,25 |
| Mapa con marcadores | 0,5 |

---

## 13. Riesgos

| Riesgo | Mitigación |
|---|---|
| Tiempo | 1.4, controles por fase, adelantar F11 |
| **Despliegue concentrado al final** (Azure, Gateway, MCP y 5 apps en F11) | Esqueleto en F3b; promociones en cada hito (P9); T9.9 Azure temprano; `escenario-completo.sh` en cada hito; adelantar F11 si el atraso pasa del 20 % |
| Intercambio encadenado (K1) | PoC-1; 2 saltos |
| Worker PHP | PoC-2 |
| Costos y créditos | T0.1; D41, D42; apagar después de cada hito; worker pool en 0; Budgets |
| Secretos en un repo público | Placeholders, keycloak-config-cli, gitleaks |
| GPU | Cuotas pedidas en F3b y en T11.1; la Mac con túnel |
| iPhone | PoC-4; reinstalar; Android |
| Memoria de la Mac | PoC-5 |
| Worker pool | Cloud Run *service* |
| EC2 como punto único | Respaldos y grabaciones |
| Red el día de la defensa | Grabaciones; la Mac con todo el compose |
| Licencia del modelo de fatiga | README |

---

## 14. Próximos pasos

1. ~~T0.1~~ respondida (ver Context).
2. T0.2 crear el remoto.
3. T0.3 → T0.4 → T0.5, cada una con su PR.
4. F1, con el visto bueno del usuario.

---

## 15. Librerías y herramientas para optimizar y entender el código (pedido del usuario)

Objetivo: menos código escrito a mano, tipos generados desde los contratos (el código "se explica solo"), un mismo lenguaje visual en las 5 apps web y la móvil, y reglas automáticas de calidad. Las versiones exactas se fijan con el lockfile; donde hay riesgo de compatibilidad se marca **verificar**.

### 15.1 Decisiones nuevas

| ID | Decisión | Valor | Motivo |
|---|---|---|---|
| D46 | Kit de interfaz | **Material en todo el sistema:** Angular Material (4 apps), **MUI (Material UI) v7** en el portal (reemplaza shadcn/ui + Tailwind de la propuesta 13.2) y **React Native Paper** (Material 3) en la app del chofer | Mismo sistema de diseño (Material 3) en las 6 interfaces, como pide 6.7 ("se ven como un solo sistema"); componentes accesibles listos (tablas, formularios, diálogos) |
| D47 | Tokens de diseño | **Style Dictionary**: un solo `tokens.json` genera variables CSS, el tema de Angular Material, el `createTheme` de MUI (con `cssVariables`) y el tema de React Native Paper. La paleta sale de **Material Theme Builder** | Un cambio de color se hace en un lugar |
| D48 | Datos del servidor en React | **TanStack**: Query v5 (caché, reintentos, *offline*), Router (rutas con tipos; **reemplaza React Router de la propuesta 13.2**), Table (tablas de facturas y viajes) y Virtual (listas largas) | Menos estado manual; tipos de punta a punta |
| D49 | Clientes generados desde contratos | **Orval** genera, desde `contratos/openapi`, *hooks* de TanStack Query + esquemas zod para el portal y la app; **GraphQL Code Generator** genera servicios tipados de Apollo Angular desde `contratos/graphql` | Si el contrato cambia, el compilador marca lo que se rompió |

### 15.2 Por pieza

| Pieza | Para optimizar | Para entender y mantener |
|---|---|---|
| 4 apps Angular | Signals + `ChangeDetectionStrategy.OnPush` + `@defer` + `NgOptimizedImage`; **TanStack Table (adaptador Angular)** sobre `mat-table` para ordenar, filtrar y paginar; TanStack Virtual para el listado de viajes | GraphQL Code Generator (`typescript-apollo-angular`); Storybook de `ui-comun`; Compodoc |
| Portal (React) | **React Compiler** (memoización automática); TanStack Query, Router, Table y Virtual; MUI con `cssVariables`; `rollup-plugin-visualizer`; Lighthouse CI (PWA) | Orval + zod; react-hook-form con `zodResolver`; Storybook |
| App del chofer | TanStack Query para lecturas (la cola propia sigue para escrituras); FlashList para listas | Orval (cliente y tipos); React Native Paper; Drizzle con tipos |
| Gateway y MCP (NestJS) | DataLoader; `graphql-query-complexity` | Esquema GraphQL como fuente; zod compartido con los contratos |
| Viajes (Java) | Virtual threads de Java 25 en Spring (`spring.threads.virtual.enabled`) | **openapi-generator** genera las interfaces de los controladores desde `contratos/openapi/viajes.yaml` (contrato primero); MapStruct; Spotless |
| Flota (NestJS) | Índices de Mongo declarados en código | Orval o `openapi-typescript` para los DTO; zod |
| Finanzas (PHP) | Octane + RoadRunner | Validación de peticiones contra el OpenAPI (`league/openapi-psr7-validator`); Laravel Pint; Larastan |
| Analítica (Python) | pandas vectorizado; `orjson` en FastAPI | `datamodel-code-generator` crea los modelos Pydantic de los eventos desde `contratos/eventos`; Ruff (lint y formato) y mypy |

### 15.3 Transversal

| Herramienta | Para qué |
|---|---|
| ESLint (flat config) + Prettier | TS en Angular, React, Expo y NestJS |
| **lefthook + commitlint** | Valida Conventional Commits en cada commit y **rechaza trailers `Co-Authored-By`** (refuerza la regla del usuario) |
| Redocly y AsyncAPI HTML | Documentación navegable de las APIs y de los eventos desde `contratos/` |
| Storybook | Catálogo visual de componentes (`ui-comun` y portal) |
| Mermaid | Diagramas dentro de las specs (se ven en GitHub, a diferencia de `docs/`) |
| Figma (gratis) | Bocetos de las pantallas clave y Material Theme Builder; opcional |

### 15.4 Dónde entra en el plan

- **T3a.5** (+0,25 j): ESLint, Prettier, Spotless, Pint, Ruff, lefthook y commitlint; los generadores (Orval, GraphQL Codegen, openapi-generator, datamodel-code-generator) quedan como scripts `generar:contratos` y el CI falla si el código generado no coincide con el contrato.
- **T6.1** (+0,5 j): Style Dictionary, tema MUI, Storybook del portal. T6.2–T6.4 usan MUI y TanStack.
- **T7.2**: React Native Paper con el tema de Style Dictionary y cliente Orval.
- **T9.4** (+0,5 j): Storybook de `ui-comun`, GraphQL Codegen, tema de Angular Material desde los tokens, TanStack Table.

### 15.5 Riesgos de compatibilidad (verificar al instalar)

| Riesgo | Qué hacer |
|---|---|
| Storybook con Angular 22 (TypeScript 6): hay reportes de Storybook que fija TS 5 en sus *peer dependencies* | Probar en T9.4; si no instala, Storybook solo en el portal y Compodoc para `ui-comun` |
| TanStack Table/Virtual para Angular 22 | Verificar `peerDependencies`; plan B: `mat-table` con `MatSort` y `MatPaginator` |
| `@tanstack/angular-query` sigue experimental | **No se usa** en Angular: Apollo ya cachea; TanStack Query solo en React y React Native |
| MUI v7 con React 19.2 y React Compiler | Verificar en T6.1 |
| React Native Paper con la nueva arquitectura (RN 0.86) | Verificar en PoC-4 con `expo-doctor` |
| openapi-generator para Spring con Boot 4.1 (Jackson 3): usa `jackson-databind-nullable`, de Jackson 2 | Verificar en T3a.2 con `openApiNullable=false`; plan B: controladores a mano y una prueba en CI que compare el OpenAPI generado con el contrato |
| `league/openapi-psr7-validator` (Finanzas) solo soporta OpenAPI 3.0 | Los contratos OpenAPI se escriben en **3.0.3** (T1.4); si hace falta 3.1, otro validador |
| gitleaks marca la clave `AIza…` de `google-services.json` | El archivo no se versiona (se genera en el build, D45) |
| El hook local de commitlint se puede saltar con `--no-verify` | commitlint también corre en `ci-ok` (T3a.5) |
