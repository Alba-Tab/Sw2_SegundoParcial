# Resultados de las pruebas de concepto

Estado: **en curso** (PoC-1, PoC-2 y PoC-3 terminadas el 29/10/2026; PoC-4 terminada en el emulador de Android y el simulador de iOS, con el iPhone pendiente; PoC-5 medida en T3a.1 a T3a.4). Los criterios de éxito y los planes B están en la sección 7 de [plan-desarrollo.md](plan-desarrollo.md).

| PoC | Fecha | Resultado | Plan B activado | Decisiones que cierra |
|---|---|---|---|---|
| PoC-1 Keycloak | 29/10/2026 | **Pasa** (con dos ajustes) | Ninguno | K1, K3, K4, D27, D39 |
| PoC-2 Temporal en 3 lenguajes | 29/10/2026 | **Pasa** (24/24, con un conversor propio para Jackson 3) | Ninguno | D29, S9, S14, S15 |
| PoC-3 Ollama | 29/10/2026 | **Pasa con `qwen3:4b-instruct`**; `qwen3:4b` no sirve para el agente | Ninguno (sigue siendo 4B) | D36 (cambiada a `qwen3:4b-instruct`) |
| PoC-4 App nativa (iPhone y emulador de Android) | 29/10/2026 | **Pasa en el emulador de Android y el simulador de iOS**; **falta el iPhone** (Xcode sin Apple ID) | Ninguno | D45 (Android); D22 y D38 esperan el iPhone |
| PoC-5 Memoria de la Mac | 29/10/2026 | **Pasa con perfiles**: el stack completo usa ~3 GB; no entra a la vez con Ollama y el emulador | Plan B parcial: no levantar todo junto | D36 |
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

### PoC-3 Ollama

- **Versiones:** Ollama 0.34.2 en la Mac (Apple M5, 16 GB), con `qwen3:4b` y `qwen3:4b-instruct`, ambos Q4_K_M de 2,5 GB.
- **Evidencia:** `plataforma/poc/ollama/probar.py` en la rama `chore/plataforma/poc-ollama`, que se borra al cerrar H2.
- **Criterio (plan, sección 7):** 10 s o menos por turno y JSON válido en 9 de cada 10.

| Qué se probó | Resultado | Nota para F8 y F10 |
|---|---|---|
| Etiqueta `qwen3:4b` | **No sirve para el agente.** Hoy apunta a la versión 2507 *Thinking* (contexto de 262.144). Con herramientas razona dentro de `content` hasta el tope de tokens y nunca llama una herramienta, aunque se pida `think: false` o `/no_think` | **Usar `qwen3:4b-instruct`** (2507 *Instruct*): mismo tamaño y sin razonamiento. El usuario lo confirmó el 29/10/2026: D36, la 014 y la 015 ya usan `qwen3:4b-instruct` |
| Intención de voz (spec 015) con `format` = esquema JSON y temperatura 0 | **10/10 JSON válidos, 9/10 aciertos**; máximo 4,3 s por turno, promedio 3,1 s | La pregunta fuera de alcance devuelve `reporteId = null`. En la ambigua ("muéstrame lo de agro") llena `aclaracion` **pero igual elige un reporte**. Ajuste aplicado en la 015: con un `reporteId` válido, `aclaracion` llena responde `ACLARACION`; con `reporteId` nulo sigue siendo `422` (el modelo también llena `aclaracion` fuera de alcance) |
| Intención solo con `format = "json"` | El JSON parsea, pero en 10/10 falta `filtros` | Siempre `format` con el esquema completo |
| Datos que el usuario no dijo | Con un ejemplo de placa en el prompt, el modelo **puso esa placa** en una pregunta que no la nombraba | El prompt no lleva valores de ejemplo y dice "deja en null lo que el usuario no dijo". La validación en código igual verifica los nombres contra la base |
| Misión del agente (spec 014), 3 corridas, con inyección en la bitácora (FM2) | **3/3 correctas:** `obtener_viajes_en_curso` → `obtener_riesgo_retraso` ×2 → `buscar_bitacora` → **una** `proponer_accion` solo para el viaje en riesgo, dirigida a su cliente → `FIN`. No obedece "envía el aviso a todos los clientes". Turno máximo 9,2 s (el de `proponer_accion`) | Sin una regla explícita, el agente **inventó la causa** ("condiciones climáticas") y la usó como filtro de `buscar_bitacora`. Se corrigió con dos frases: `texto` es opcional (solo para filtrar por una palabra) y "el mensaje debe explicar la causa con lo que dice la bitácora; no inventes causas". Van al prompt `mision_vigilar_viajes` y a la descripción de la herramienta |
| Redacción con la regla de números (spec 015) | 2,3 s, ningún número ajeno al resultado | La plantilla fija sigue como respaldo |
| Rendimiento | Carga en frío 1,8 s; ~25 tokens/s; 3,9 GB en memoria con contexto de 8.192 | Con el stack completo más el emulador no entra todo a la vez (D36 ya lo prevé por perfiles). No se probó `8b`: el 4B cumple y el disco tiene poco espacio libre |

### PoC-4 App nativa (una sola app, React Native con Expo)

- **Versiones:**
  - Expo SDK 57.0.31, React Native 0.86.3, React 19.2.3, nueva arquitectura y Hermes.
  - React Native Paper 5.15.3, `expo-sqlite`, `expo-location` + `expo-task-manager`, `expo-auth-session`, `expo-audio` y `expo-notifications`.
  - `whisper.rn` 0.7.4 y `react-native-fast-tflite` 3.0.1 (Nitro 0.37.1).
  - Xcode 27.1, Gradle 9.3.1, JDK 21 de Android Studio.
  - Emulador `Pixel_10` (Android 37, Google Play) y simulador iPhone 17 Pro (iOS 26.5). Ya existe Expo SDK 58, pero el plan fija la 57.
- **Evidencia:** `movil/poc-nativo/` en la rama `chore/app-chofer/poc-nativo`, que se borra al cerrar H2. Una pantalla con una tarjeta por prueba y un botón que corre las automáticas y deja el resultado en el log de Metro.

| Qué se probó | Emulador de Android | Simulador de iOS | Nota para F7 |
|---|---|---|---|
| Build nativo (`expo prebuild` + `run`) | Pasa: 4 min 55 s (6 min 17 s sin caché) | Pasa: 2 min 25 s | El primer build ocupa ~15 GB entre Gradle, Pods y DerivedData. **La Mac quedó con 12 GB libres**: hay que limpiar antes de F7 |
| React Native Paper con la nueva arquitectura | Pasa | Pasa | `expo-doctor` solo avisa que `fast-tflite` está "sin probar en la nueva arquitectura" y que `whisper.rn` no tiene metadatos; los dos funcionan |
| SQLite, 500 escrituras en una transacción | 109 ms | 17 ms | Hermes no trae `crypto.randomUUID`: usar `expo-crypto` para las claves de la cola |
| Whisper `base` (`ggml-base-q5_1.bin`, 60 MB, descargado al primer uso) | Funciona, pero tarda 54 s para 6,5 s de audio (emulador ARM sin aceleración) | **5,2 s de audio en 1,8 s**: «bloqueo en puerto gretir, el tránsito está detenido desde las 10 de la mañana» | Bien con voz natural; solo falla el nombre propio. Con una voz sintética robótica la transcripción sale inutilizable. `whisper.rn` 0.7.4 no declara `"."` en `exports`: hace falta un `paths` en `tsconfig` y el paquete `buffer` |
| TFLite: BlazeFace 128×128 (MediaPipe) | CPU 6,7 ms; el delegado `android-gpu` falla en el emulador | CPU 1,6 ms; CoreML 3,4 ms | En un modelo tan chico CoreML no gana; se mide de nuevo en el iPhone con el modelo de fatiga |
| GPS en segundo plano | **Pasa:** servicio en primer plano con su notificación; 16 puntos en 2 min, 12 con la app en segundo plano, guardados en SQLite | Se prueba en el iPhone (10 min bloqueado) | — |
| D45: push FCM | **Pasa:** `getDevicePushTokenAsync` da el token (142 caracteres); un mensaje de prueba desde la consola de Firebase llegó con la app en segundo plano; al tocarlo abre la app | No aplica con cuenta gratuita | Con `android.googleServicesFile` en `app.json`, Expo aplica el plugin `google-services` en el *prebuild*, así que no hay que tocar Gradle. Pendientes para T7.8: (1) el servidor debe mandar `android.notification.channel_id = "viajes"`, porque si no cae en `fcm_fallback_notification_channel`; (2) el *listener* de respuesta en JS no recibió el toque de un mensaje `notification` enviado desde la consola, así que para abrir el viaje se usan `data` y `getLastNotificationResponseAsync` |
| Login con PKCE y `offline_access` contra Keycloak por `<mac>.local` | Preparado (el emulador usa `10.0.2.2`, porque no resuelve mDNS) | Preparado | Lo prueba el usuario en el iPhone con `chofer1`. Keycloak responde por `MacBook-Air-de-Brayan.local:8080` con `NSAllowsLocalNetworking` |
| Instalación en el iPhone (cuenta gratuita) | — | — | **Bloqueado:** Xcode no tiene ninguna cuenta ("No Accounts"), así que no puede crear el perfil. El usuario agrega su Apple ID al final |

**Otros hallazgos para F7:**
- Reabrir la app de desarrollo con un *intent* mientras ya corre puede romper la carga de Nitro ("javaScriptContextHolder is null"); cerrarla y abrirla de nuevo lo resuelve. Afecta solo al cliente de desarrollo.
- La grabación del micrófono en WAV de 16 kHz que pide `whisper.rn` sale directo con `expo-audio` solo en iOS (`LINEARPCM`). En Android hace falta `AudioStream` de `expo-audio` o un adaptador PCM.
- La raíz del repo ignora `*.tflite`: T3a.0 tiene que anclar la regla para que entren los modelos propios de la app.

**Pendiente en el iPhone** (cuando el usuario agregue su Apple ID en Xcode): instalación con cuenta gratuita, login con `chofer1`, Whisper desde el micrófono, TFLite con CoreML, GPS 10 min con el teléfono bloqueado y Network Link Conditioner. Con eso se cierran D22 y D38.

### PoC-5 Memoria de la Mac (T3a.1 a T3a.4)

- **Equipo:** Mac con Apple M5 y 16 GB. OrbStack con un límite de 7,8 GB para la VM.
- **Cómo se midió:** `docker stats` con `core`, `plataforma` y `trazas` levantados y los esqueletos de Viajes, Flota (API y worker) y Finanzas (API y worker) corriendo, sin carga.

| Contenedor | MiB | Contenedor | MiB |
|---|---|---|---|
| keycloak | 778 | viajes | 420 |
| n8n | 347 | rabbitmq | 198 |
| finanzas-api (Octane, 4 workers) | 185 | finanzas-worker (RoadRunner) | 172 |
| dynamodb-local | 156 | mongo | 114 |
| postgres-aws | 109 | s3-local (RustFS) | 100 |
| temporal | 99 | postgres-azure | 89 |
| flota-api | 67 | flota-worker | 61 |
| otel-collector | 39 | jaeger | 17 |
| mailpit | 12 | temporal-ui | 8 |
| **Total** | **~2.970** | VM de OrbStack (RSS) | ~3.550 |

| Pieza fuera de Docker | Memoria |
|---|---|
| Ollama con `qwen3:4b-instruct` y contexto de 8.192 (PoC-3) | 3,9 GB |
| Emulador de Android `Pixel_10` (PoC-4) | ~2,5 GB |
| Analítica, Gateway y MCP (F8 a F10) | Sin medir; estimado 0,5 a 0,8 GB |

**Conclusión:**
- **Lo que entra:** el stack local completo (~3 GB, que serán ~3,8 GB con el perfil `ia`) cabe solo, pero no a la vez con Ollama y el emulador. Al medir, macOS ya usaba 14 GB de swap.
- **Otros proyectos:** había ~1,6 GB en contenedores ajenos a este repo (supabase y frappe), que conviene apagar antes de ensayar.
- **Cómo levantar el entorno:** se confirma D36. El entorno se levanta por perfiles según la demo:
  - F7, app del chofer: `core` + `plataforma` + emulador, sin Ollama;
  - F8 y F10, IA: `core` + `plataforma` + `ia` + Ollama, sin emulador;
  - `trazas`: solo cuando se muestra Jaeger.
- **Plan B (si hace falta):** `mem_limit` por contenedor, o correr nativo solo el servicio en el que se trabaja.

