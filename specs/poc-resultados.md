# Resultados de las pruebas de concepto

Estado: **en curso** (PoC-1 y PoC-2 terminadas el 29/10/2026; el resto se llena en F2 y F3a). Los criterios de éxito y los planes B están en la sección 7 de [plan-desarrollo.md](plan-desarrollo.md).

| PoC | Fecha | Resultado | Plan B activado | Decisiones que cierra |
|---|---|---|---|---|
| PoC-1 Keycloak | 29/10/2026 | **Pasa** (con dos ajustes) | Ninguno | K1, K3, K4, D27, D39 |
| PoC-2 Temporal en 3 lenguajes | 29/10/2026 | **Pasa** (24/24, con un conversor propio para Jackson 3) | Ninguno | D29, S9, S14, S15 |
| PoC-3 Ollama | — | pendiente | — | D36 |
| PoC-4 App nativa (iPhone y emulador de Android) | — | pendiente | — | D22, D38, D45 |
| PoC-5 Memoria de la Mac | — | pendiente | — | D36 |
| Micro-PoC Whisper web | — | pendiente | — | D38 |
| PoC de despliegue | — | pendiente | — | D32, D33, D35 |

## Notas por PoC

<!-- Por cada PoC: qué se probó, versiones exactas, qué falló, evidencia (comando o captura) y decisión. -->

### PoC-1 Keycloak

- **Versiones:** Keycloak 26.8.1 (`quay.io/keycloak/keycloak:26.8`, `start-dev`); keycloak-config-cli `6.5.1-26.5.5` (la más nueva publicada; no hay imagen para 26.8).
- **Evidencia:** scripts en la rama `chore/plataforma/poc-keycloak` (`plataforma/poc/keycloak/`), que se borra al cerrar H2.

| Qué se probó | Resultado | Nota para T2.2 y el código |
|---|---|---|
| K1: cadena `demo-cli` (como cc-tablero) → `gateway` → `analitica` → `mcp-server` → `analitica` | **200 en los 3 intercambios**, mismo `sub` y mismo `sid` en todos. El bug RHBK-3599 (pérdida de `sid` en el tercer salto) no aparece en 26.8.1 | Cada intercambio debe enviar `audience=<cliente>` **y** `scope=aud-<cliente>`: sin el scope, Keycloak responde `Requested audience not available` (los scopes de audiencia son opcionales del cliente que intercambia). Va en `libs/intercambio-token` |
| Token del agente (client credentials, `agente_lectura`) intercambiado por `mcp-server` hacia `analitica` | Pasa; conserva `agente_lectura` | — |
| K3: sin roles por defecto; `offline_access` solo con `chofer` | Pasa: `gerente1` recibe `not_allowed` al pedir `offline_access`; `chofer1` recibe un refresh `Offline` | El rol compuesto `default-roles-transporte` queda vacío pero sigue apareciendo en `realm_access` (inofensivo) |
| K4: FGAP v2, `viajes` escribe `clienteId` y asigna `cliente` | Pasa: 200/204 sobre un miembro de `registro-portal`; 403 al leer o editar a `gerente1` y al asignar `gerente` | (1) La búsqueda `GET /users?username=` no devuelve usuarios permitidos por grupo: Viajes usa el `sub` del token como id y no busca. (2) `map-roles` solo existe en el tipo *Users*, así que se da para todos los usuarios; `map-role` sigue limitado al rol `cliente` (Viajes puede dar `cliente` a cualquiera y ningún otro rol). (3) Hace falta `query-users` en la cuenta de servicio. (4) Los usuarios internos de la semilla se crean fuera de `registro-portal` |
| Atributo `clienteId` en el perfil (vista y edición solo de administradores) y su claim | Pasa: el token siguiente trae `clienteId` y el rol `cliente` | — |
| D39: *device authorization grant* en `demo-cli` | Pasa (`user_code`, 600 s) | — |
| D27: cierre de sesión detectado al renovar | Pasa: después de `logout`, la renovación da `invalid_grant` | El salto de SSO entre dos SPA con el navegador se comprueba con las apps reales (FK2 y FK3, F9) |
| keycloak-config-cli con variables | Pasa contra 26.8.1: cambió el secreto del `gateway` desde una variable, creó un rol y conservó los scopes existentes | La sintaxis es **`$(env:VAR)`** con `IMPORT_VARSUBSTITUTION_ENABLED=true` (no `${...}`). Se cambió en el plan, AGENTS.md y la regla de gitleaks. Usar `IMPORT_MANAGED_*=no-delete` hasta que el realm completo esté en el archivo |

**Otros hallazgos para T2.2:** Keycloak 26.8 avisa que *Full scope allowed* está obsoleto en los clientes; el realm definitivo lo desactiva y asigna los roles por *scope mapping*. Memoria del contenedor en reposo: unos 600 MB.

### PoC-2 Temporal en 3 lenguajes

- **Versiones:**
  - Servidor: `temporalio/server:1.32.1` sobre `postgres:17`, con el esquema aplicado por `temporalio/admin-tools:1.32.1`.
  - Viajes: Java 25 (Temurin), Temporal Java SDK 1.40.0 y Jackson 3.1.7, la versión que fija Spring Boot 4.1.2.
  - Finanzas: PHP 8.4.27, Laravel 13.39.0, `temporal/sdk` 2.20 y RoadRunner 3.0.1.
  - Flota: Node 24.22 y `@temporalio/worker` 1.25.0.
- **Evidencia:** compose y `escenarios.sh` en la rama `chore/plataforma/poc-temporal` (`plataforma/poc/temporal/`), que se borra al cerrar H2.
- **Qué se implementó:** un `ProgramarViaje` reducido (pasos 1, 2, 3, pivote, 5 y 6 con sus compensaciones; sin 2b ni intervención, que llegan en F4). Las actividades de PHP y TS devuelven el ejemplo del contrato como resultado. Las de TS validan con ajv cada entrada que manda Java contra el esquema.

| Qué se probó | Resultado | Nota para F3a y F4 |
|---|---|---|
| PostgreSQL 17 para Temporal | Pasa: `temporal-sql-tool --plugin postgres12` aplica el esquema hasta 1.14 (`temporal` y `temporal_visibility`) | **`temporalio/auto-setup` ya no se publica para 1.32** (la última es 1.23). En T3a.1 y en la EC2: un contenedor `admin-tools` crea y actualiza el esquema, otro registra el namespace `transporte` con 30 días, y recién después arranca `temporalio/server`. El servidor 1.32 exige el archivo `config/dynamicconfig/docker.yaml`, aunque esté casi vacío |
| S15: *fixtures* del contrato | Pasa: los 19 ejemplos de 15 tipos se deserializan en *records* de Java en modo estricto y se vuelven a serializar iguales. Java → PHP → TS → Java completa con los ejemplos y TS no rechazó ninguna entrada | La comparación se hace con el JSON en texto: `toneladas` como `BigDecimal` da `DecimalNode` y el ejemplo da `IntNode` |
| Jackson 3 en el SDK de Java | Pasa con un `PayloadConverter` propio (~40 líneas) | El SDK 1.40 trae `Jackson3JsonPayloadConverter`, pero **no acepta un `JsonMapper` propio**. Por eso Viajes registra su conversor con `NON_NULL` (contrato: "sin campos `null`") y **`FAIL_ON_UNKNOWN_PROPERTIES` activado a mano: en Jackson 3 viene desactivado**. `java.time` (`Duration`, `LocalDate`, `Instant`) funciona sin módulos extra |
| S9: errores no reintentables entre lenguajes | Pasa: `CREDITO_INSUFICIENTE` (PHP) y `SIN_UNIDAD_COMPATIBLE` (TS) llegan a Java como `ApplicationFailure` con su `type`, **un solo intento**, y `details` se deserializa como `DetalleFallo` | PHP: `new ApplicationFailure($msg, $tipo, true, EncodedValues::fromValues([$detalle]))`. TS: `ApplicationFailure.create({ type, nonRetryable: true, details: [detalle] })` |
| Compensación en orden inverso (FS4) | Pasa: `Finanzas.liberarCredito` deja la reserva `LIBERADA` con el motivo en PostgreSQL y `Viajes.cancelarViaje` recibe el código | — |
| S14: nombres explícitos | Pasa: `@ActivityMethod(name = "Finanzas.validarYReservarCredito")` (Java), `#[ActivityInterface(prefix: "Finanzas.")]` (PHP) y el mapa `{'Flota.reservarUnidad': …}` (TS) se encuentran | — |
| FS5: worker de Flota apagado | Pasa: la consulta `estado` muestra `RESERVANDO_UNIDAD` y el workflow sigue al volver el worker | — |
| FS6: Flota y Viajes caídos a la mitad | Pasa: `crearViaje` y `reservarUnidad` aparecen programados una sola vez en el historial | — |
| D43: doble `start` con el mismo `workflowId` | Pasa: una sola ejecución | El CLI (SDK de Go) devuelve el run existente sin error. El SDK de Java lanza `WorkflowExecutionAlreadyStarted`, que Viajes trata como éxito (D43) |
| Reconexión de Laravel | Pasa: después de reiniciar PostgreSQL de Finanzas, la actividad siguiente termina en el **primer intento** y `outbox:publicar` se recupera solo | Laravel reconecta ante "conexión perdida" fuera de una transacción. Dentro de una transacción el error sube y Temporal reintenta la actividad, que es idempotente |
| D29: RoadRunner con `temporal` y `service` | Pasa: un proceso `rr` levanta los workers de Temporal y los dos comandos artisan; si `eventos:consumir` termina, lo reinicia en 2 s con otro pid; si se mata un `worker.php` con `kill -9`, lo repone y la saga siguiente completa | RoadRunner corre **3** procesos `worker.php`: 1 de workflows (siempre) y los 2 de actividades. El de workflows no abre conexión a la base porque Laravel conecta solo al usarla, así que el pool de Finanzas (8) no cambia |
| Memoria en reposo | Temporal 110 MB, su PostgreSQL 106 MB, Viajes 300 MB, Finanzas 180 MB, Flota 60 MB, UI 7 MB | Unos 760 MB en total; entra en el cálculo de PoC-5 |

**Otros hallazgos para el código:**
- Node 24 ejecuta el `.ts` del worker directo (*type stripping*) con el SDK 1.25. Flota igual compila con `tsc` en F3a para tener chequeo de tipos.
- En el historial, `ActivityTaskStarted` se escribe al terminar la actividad con el intento final, así que `attempt = 1` prueba que no hubo reintentos.

