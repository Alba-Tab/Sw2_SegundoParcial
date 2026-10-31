# Decisiones del proyecto

Estado: **confirmadas el 28/10/2026** (tarea T0.1 del plan). Cada decisión tiene un estado:

| Estado | Significado |
|---|---|
| `confirmada` | El usuario aceptó el valor recomendado o lo cambió explícitamente |
| `confirmada-sujeta-a-PoC` | Aceptada, pero una prueba de concepto puede obligar a usar su plan B |
| `cambiada` | Se reabrió después de confirmarla; la fila dice el valor nuevo y por qué |

Cambiar una decisión confirmada exige una rama `docs/specs/decision-dxx-<tema>` con su PR, y actualizar las specs y contratos que la usan.

## 1. Datos de entrada

| ID | Pregunta | Respuesta |
|---|---|---|
| I1 | Fecha de la defensa | No dada: el usuario pide **plan completo, sin limitarse por fechas** |
| I2 | Jornadas por semana | No dada (ver I1). No se aplica recorte desde el día 0 |
| I3 | RAM de la Mac | **16 GB** → D36 usa `qwen3:4b-instruct` |
| I4 | ¿Dominio propio? | No indicado → sslip.io (D32) |
| I5 | Dispositivos | **iPhone** para la presentación (instalado 2 días antes) y **emulador de Android** en la Mac para probar las notificaciones push (D22, D45) |

Estrategia de repositorios: **monorepo** (D24, D44), elegido por el usuario tras comparar monorepo, 5 repos por grupos y 17 repos por pieza.

## 2. Decisiones

La columna "#11" es el número de la decisión en la sección 11 de `docs/analisis-pre-desarrollo.md` (documento local). En la columna de estado, "—" es `confirmada` y "PoC" es `confirmada-sujeta-a-PoC`: se cierra con el resultado de esa prueba en `specs/poc-resultados.md`.

**Negocio**

| ID | #11 | Decisión | Valor recomendado | Impacto si cambia | Estado |
|---|---|---|---|---|---|
| D01 | 1 | Línea de un cliente nuevo | Finanzas la crea con el primer `ClienteActualizado`; límite 30.000,00 BOB; sin prepago | Con "aprobación obligatoria", todo cliente nuevo pasa por 2b | — |
| D02 | — | Carrera entre alta y saga (S10) | La copia y la línea se crean con el evento, y además el paso 2 lanza `CLIENTE_NO_REPLICADO` (reintentable) | — | — |
| D03 | 2 | Servicio–Viaje | 1:1. `servicioId` y `viajeId` (UUIDv7) los genera Viajes antes del workflow. `workflowId = programar-viaje-<servicioId>`. Máximo 30 t (`TONELAJE_EXCEDIDO`) | 1:N cambia la saga | — |
| D04 | 3 | Mora | Una factura con saldo > 0 vencida hace más de 7 días. Vencimiento a los 30 días de la emisión | Cambia la semilla | — |
| D05 | 3 | Monto alto | Más de 15.000,00 BOB | Hay que ajustar D10 | — |
| D06 | 3 | Geocerca | Destino, `radioMetros` (300 m) y `distanciaKm` en la Ruta. `distanciaKm` de semilla (verificar): Aula 120 (con las coordenadas de la defensa), Cochabamba 470, La Paz 850, Arica 1.300 | — | — |
| D07 | 3 | Mantenimiento | Cada 10.000 km. Flota suma `kmRecorridos` (= `Ruta.distanciaKm`), que viene en `EntregaConfirmada` y en `EntregaRechazada`. SOAT o inspección que vencen en 15 días o menos pasan la unidad a `MANTENIMIENTO_PENDIENTE` | Cambia el contrato de eventos | — |
| D08 | 3 | Umbrales de sensores | Combustible: caída de 8 % o más de la capacidad en 10 min con `velocidadKmh = 0`, simulador cada 10 s. Frenada brusca: desaceleración de 0,4 g o más | Cambian las specs 009 y 005 | — |
| D09 | — | Analítica | Alerta de retraso con probabilidad de 0,70 o más. `contamination = 0,05`. Misión cada 10 min, máximo 8 pasos y 90 s, más disparo manual | — | — |
| D10 | — | Tarifas (BOB por t) | Base: Cochabamba 250, La Paz 380, Arica 650, Aula 100. Factor: `GRANOS` 1,00, `INSUMOS` 1,10, `INSUMOS_LIQUIDOS` 1,25, `CONTENEDOR` 1,20. La matriz guarda la tarifa final | Arica con 28 t de granos = 18.200, cae en 2b | — |
| D11 | — | Compatibilidad | `GRANOS`→`FURGON`; `INSUMOS`→`FURGON`/`PLATAFORMA`; `INSUMOS_LIQUIDOS`→`CISTERNA`; `CONTENEDOR`→`PLATAFORMA`. Capacidad ≥ toneladas. Licencia C vigente. Unidad y chofer con una reserva activa como máximo. **Orden de elección determinista:** entre las compatibles, la de mayor kilometraje desde el último mantenimiento (así FF3 siempre toma el furgón de 9.950 km) | Un calendario cuesta +1 j | — |
| D12 | — | Usuarios internos (K5) | Semilla con ids fijos y el mismo `usuarioSub` en Flota. **Contraseñas de nube desde secretos; solo se documentan las locales** | — | — |
| D13 | — | Reasignación | Fuera del plan base; la regla queda escrita en 005 | +1,5 j si se incluye | — |

**Saga**

| ID | #11 | Decisión | Valor recomendado | Impacto si cambia | Estado |
|---|---|---|---|---|---|
| D14 | — | Retención | Namespace `transporte`, 30 días | — | — |
| D15 | — | Timeouts | Sección 3 de este archivo | — | — |
| D16 | — | Paso 2b | Reserva `PENDIENTE_APROBACION`. Espera de 24 h. Señal `aprobacionCredito` (`aprobado`, `aprobadoPor`, `motivo`) por Gateway → Viajes → Temporal. `SolicitudAprobacion` en Finanzas. Código `APROBACION_VENCIDA` | — | — |
| D17 | 4 | Cancelación frente al paso 5 | Solo con `CONFIRMADO` y `confirmacionCompleta = true`; si no, 409 `CONFIRMACION_EN_CURSO`. En `EN_RUTA`: 409 `CANCELACION_NO_PERMITIDA` | Lápida en Flota +0,5 j | — |
| D18 | 5 | La compensación publica `ViajeCancelado` | Sí, con `origen = SAGA` (en la cancelación normal, `USUARIO`). Consumidores idempotentes | — | — |
| D19 | — | Eventos nuevos | Sí: `EntregaObservada`, `EventoConduccionRegistrado` y `PosicionActualizada` (uno por lote). No: `CotizacionCreada` ni `CreditoAprobado`/`CreditoRechazado` | — | — |
| D20 | — | Flota consume `ViajeIniciado` | Sí: la unidad pasa de `RESERVADA` a `EN_VIAJE` | — | — |
| D43 | — | Doble envío de `POST /servicios` | Excepción a 000 §4.1: con la misma clave y el mismo hash en `EN_PROCESO`, Viajes vuelve a llamar `start` con el `workflowId` guardado; `AlreadyStarted` cuenta como éxito y responde 202 con el mismo `servicioId`. Umbral 0 s porque `start` es idempotente. Las demás operaciones siguen respondiendo 409 | FS7 espera dos 202 | — |

**Técnicas**

| ID | #11 | Decisión | Valor recomendado | Alternativa recortable | Estado |
|---|---|---|---|---|---|
| D21 | 7 | Excel | **Por el Gateway** (análisis). En la mutación `exportarReporte` (que sí trae el token del usuario), el Gateway intercambia el token y pide a Analítica que genere el archivo; **Analítica lo guarda en su base 10 min** y devuelve su `exportacionId`. El Gateway responde una URL `GET /exportaciones/{token}`, donde `token` es un HMAC sin estado con `exportacionId`, `sub` y vencimiento (10 min). Al descargar, cualquier instancia del Gateway valida el HMAC y pide el archivo a Analítica con su token de servicio: funciona aunque Cloud Run cambie de instancia o haya bajado a cero. Contrato en `contratos/openapi/gateway.yaml` | URL firmada directa a Analítica; exige CORS y Analítica pública. Nivel 1, ahorra 0,25 j | — |
| D22 | 6 | Dispositivo | **Confirmado por el usuario:** la presentación usa el iPhone con Xcode y cuenta gratuita, instalado 2 días antes de la defensa. La app también compila para **Android**, y el **emulador de Android en la Mac** se usa para probar y demostrar las notificaciones push (D45), porque con cuenta gratuita de Apple no hay push en iPhone. Dos builds según `APP_ENTORNO=local|nube` en `app.config.ts` (URLs `EXPO_PUBLIC_*`) | — | PoC |
| D45 | — | Notificaciones push al chofer (pedido del usuario) | **FCM directo** con el proyecto de Firebase que ya existe en GCP. La app registra su token nativo (`getDevicePushTokenAsync`) en Viajes (`PUT /api/v1/dispositivos/mio`). Un **consumidor interno del Outbox** de Viajes (después del commit, nunca dentro de la actividad ni del caso de uso) envía por el puerto de salida `NotificadorPush` (adaptador FCM HTTP v1), idempotente por `eventId` y con `collapse_key = viajeId`, para `ViajeConfirmado` (viaje asignado), `ViajeCancelado` **solo con `origen = USUARIO`** y la aprobación o rechazo de una entrega observada. Credencial de FCM **sin clave guardada**: Workload Identity Federation de GCP con AWS como proveedor, usando el rol de la EC2. `google-services.json` se genera en el build desde un secreto (no se versiona). En iPhone el envío se omite sin error. Emulador con imagen *Google Play* | Expo Push Service (requiere subir credenciales de FCM a EAS) | PoC-4 |
| D23 | 9 | Observabilidad | **OTel Collector + Jaeger en el perfil `trazas`** (análisis 10.5 lo pone en `demo`; se separa para no depender de Toxiproxy). En la nube, logs con `correlationId` | Solo logs. Nivel 1, ahorra 1 j | — |
| D24 | 8 | Raíz y binarios | Se mantiene `Sw2_SegundoParcial`. `.docx` y `.eap` no se versionan. `docs/` local | — | — |
| D25 | 10 | Formato de specs | El de 000 | — | — |
| D26 | — | Verificar correo (K6) | Desactivado | — | — |
| D27 | — | Tokens | Access token de 5 min (demo 2). `refresh_token` sin iframe. Sesión de 30 min inactiva y 10 h máximo. `offline_access` solo el chofer. Renovación al volver a la pestaña | — | — |
| D28 | — | Temporal UI y consola de RabbitMQ | **Solo por túnel SSM** (análisis); no se publican | OIDC de Temporal UI contra Keycloak, como mejora (+0,5 j) | — |
| D29 | — | Procesos PHP | RoadRunner: 2 workers `temporal` de actividades (más el de workflows que RoadRunner levanta siempre) y plugin `service` con `eventos:consumir` y `outbox:publicar`. Plan B: supervisord | — | — (PoC-2 pasó el 29/10/2026) |
| D30 | — | Sensor | Flota consume `amq.topic` por AMQP; `mqtt` solo en el simulador | — | — |
| D31 | — | Hosting | Firebase Hosting, 5 sitios. Plan B: S3 + CloudFront | — | — |
| D32 | — | Dominio | sslip.io sobre la IP elástica con Caddy, o el dominio propio (I4) | — | PoC (F3b) |
| D33 | — | Regiones | AWS `us-east-1`; GCP `us-central1`; Azure `eastus` o la más cercana con T4 | — | PoC (F3b) |
| D34 | — | Registros | ECR, Artifact Registry, GHCR público (sin secretos en las imágenes) | — | — |
| D35 | — | EC2 | t3.medium con 2 GB de swap; t3.large si se miden más de 3,5 GB | — | PoC (F3b) |
| D36 | — | LLM | **La Mac tiene 16 GB (I3): `qwen3:4b-instruct` en Q4** (Qwen3 4B 2507 *Instruct*; cambiada el 29/10/2026 por la PoC-3: la etiqueta `qwen3:4b` apunta a la variante *Thinking*, que con herramientas razona sin parar y nunca llama una. 8b solo si una prueba muestra que cabe). Ollama, el emulador de Android y el stack completo no corren a la vez: se levanta por perfiles lo que pide cada demo. Nube: T4 en Azure → L4 en Cloud Run → la Mac con túnel autenticado | — | `cambiada` (PoC-3, 29/10/2026) |
| D37 | — | SMTP en la nube | Brevo o Gmail con contraseña de aplicación | — | — |
| D38 | — | Modelos de IA | Whisper `tiny` (web) y `base` (app), Tesseract `spa`, servidos desde el hosting propio. Detector de fatiga público en TFLite con su licencia | — | PoC-4 |
| D39 | — | Tokens para scripts | Cliente `demo-cli` público. En local, *direct grant*. **En la nube, solo *device authorization grant*** (sin *direct grant*). Sus tokens tienen los permisos del mismo usuario; se puede limitar a los usuarios de semilla con una condición de rol en el flujo. El mismo realm lo resuelve con la variable `$(env:KC_DEMO_CLI_DIRECT_GRANT)` (`true` en local, `false` en la nube). Los scripts guardan el `refresh_token` de una sola sesión por rol, para no iniciar sesión por *device grant* en cada corrida | Marcar FS7 y FO3 "en la nube, desde el portal o la app" | — |
| D40 | — | Subida de archivos (propuesta 5.5, matriz 12) | **(a) Multipart firmado de S3 o MinIO**: partes de 5 MB, se reanuda la parte que falla; +0,75 j en T5.1 y T7.5. La demo usa una foto sin comprimir de más de 5 MB | (b) Un archivo por URL. Es un **cambio de alcance** que el usuario tiene que confirmar. Nivel 2 | — |
| D41 | — | Plan de AWS | Se crea en el plan gratuito con Budgets en 10, 25 y 50 USD desde el primer día. Pasa a plan de pago cuando el crédito baje de 30 USD o al mes 5, lo que ocurra primero (si no, la cuenta se cierra). Verificar que el plan gratuito permita SSM y ECR | — | — |
| D42 | — | Cuenta de GCP | Siempre en F3b, y pasar a cuenta de pago **antes** de pedir la cuota de GPU (el crédito se conserva; si vence, se acepta, porque con cuenta de pago los recursos no se detienen) | — | — |
| D44 | — | Visibilidad del repo | **Público** (análisis sec. 2: los minutos de Actions no se consumen). Ningún secreto en el repo ni en las imágenes; `docs/` queda fuera | Privado: los minutos de Actions cuentan contra la cuota gratuita | — |

## 3. D15: timeouts y reintentos

Los valores de demo **no se leen del entorno dentro del workflow**: la API de Viajes los lee y los pasa como `parametrosSaga` en la entrada (determinismo). Va al contrato T1.2 y a la prueba de *replay*.

| Actividad | Cola | StartToClose | ScheduleToClose | Reintentos | No reintentables |
|---|---|---|---|---|---|
| `Viajes.crearViaje` | viajes | 10 s | 5 min | 1 s, ×2, máximo 30 s | `VALIDACION` |
| `Finanzas.validarYReservarCredito` | finanzas | 15 s | 30 min | igual | `COTIZACION_VENCIDA`, `COTIZACION_AJENA`, `CREDITO_INSUFICIENTE` (`REQUIERE_APROBACION` es un resultado) |
| `Finanzas.registrarDecisionCredito` | finanzas | 15 s | 30 min | igual | — |
| `Flota.reservarUnidad` (con relectura) | flota | 15 s | 30 min | igual | `SIN_UNIDAD_COMPATIBLE` |
| `Viajes.confirmarViaje` (pivote) | viajes | 10 s | sin límite | sin límite | — |
| `Flota.confirmarReserva` | flota | 15 s | sin límite | sin límite, máximo 1 min | — |
| `Viajes.marcarConfirmacionCompleta` | viajes | 10 s | sin límite | sin límite | — |
| Compensaciones: `Flota.liberarReserva`, `Finanzas.liberarCredito`, `Viajes.cancelarViaje` | — | 15 s | `parametrosSaga`: 10 min (demo 2 min) | `parametrosSaga`: 8 (demo 4) | Si se agotan: `REQUIERE_INTERVENCION` |
| `Viajes.marcarRequiereIntervencion` (spec 011) | viajes | 10 s | sin límite | sin límite | — |

La espera de 2b sale de `parametrosSaga.esperaAprobacion`: `PT24H`, y en demo `PT3M`.

## 4. Decisiones agregadas a pedido del usuario (D46–D49)

| ID | Decisión | Valor | Motivo |
|---|---|---|---|
| D46 | Kit de interfaz | **Material en todo el sistema:** Angular Material (4 apps), **MUI (Material UI) v7** en el portal (reemplaza shadcn/ui + Tailwind de la propuesta 13.2) y **React Native Paper** (Material 3) en la app del chofer | Mismo sistema de diseño (Material 3) en las 6 interfaces, como pide 6.7 ("se ven como un solo sistema"); componentes accesibles listos (tablas, formularios, diálogos) |
| D47 | Tokens de diseño | **Style Dictionary**: un solo `tokens.json` genera variables CSS, el tema de Angular Material, el `createTheme` de MUI (con `cssVariables`) y el tema de React Native Paper. La paleta sale de **Material Theme Builder** | Un cambio de color se hace en un lugar |
| D48 | Datos del servidor en React | **TanStack**: Query v5 (caché, reintentos, *offline*), Router (rutas con tipos; **reemplaza React Router de la propuesta 13.2**), Table (tablas de facturas y viajes) y Virtual (listas largas) | Menos estado manual; tipos de punta a punta |
| D49 | Clientes generados desde contratos | **Orval** genera, desde `contratos/openapi`, *hooks* de TanStack Query + esquemas zod para el portal y la app; **GraphQL Code Generator** genera servicios tipados de Apollo Angular desde `contratos/graphql` | Si el contrato cambia, el compilador marca lo que se rompió |

Estado: `confirmada` (las pidió el usuario). Los riesgos de compatibilidad están en la sección 15.5 de `specs/plan-desarrollo.md`.

## 5. Valores propuestos por las specs (D50 en adelante)

Valores que las specs 005–010 y 013–016 necesitaban y que ni la propuesta ni D01–D49 fijaban. Estado `confirmada`: el usuario pidió usar los valores recomendados. Cambiar uno sigue la regla del inicio de este archivo.

| ID | Spec | Valor | Estado |
|---|---|---|---|
| D50 | 005 | `GET /viajes/mios` trae, además de los viajes activos, los terminados en los últimos 7 días | confirmada |
| D51 | 005 | La app del chofer no recibe montos del servicio | confirmada |
| D52 | 005 | Un punto GPS cada 20 s o cada 100 m, lo que ocurra primero (dentro de los 15–30 s de la propuesta 4.4) | confirmada |
| D53 | 005 | El audio de la bitácora por voz nunca sale del celular; solo se envía el texto | confirmada |
| D54 | 005 | La cola de un viaje cancelado se guarda 7 días en "Descartadas" | confirmada |
| D55 | 005 | `sync_cursor` con PK `dispositivoId` y SK `viajeId` (la propuesta 4.4 no tenía SK) | confirmada |
| D56 | 005 | Un lote de GPS lleva de 1 a 100 puntos | confirmada |
| D57 | 005 | Un punto GPS se acepta con `registradaEn` ≥ `iniciadoEn` − 10 min | confirmada |
| D58 | 005 | Con velocidad > 5 km/h la app solo permite dictar | confirmada |
| D59 | 005 | Frenada brusca: 0,4 g (D08) sostenida 300 ms con velocidad > 20 km/h, una cada 10 s | confirmada |
| D60 | 005 | Fatiga: ojos cerrados ≥ 1,5 s o 3 bostezos en 2 min | confirmada |
| D61 | 005 | Sincronización: una petición a la vez por viaje, un lote de GPS a la vez, hasta 2 partes de foto en paralelo | confirmada |
| D62 | 005 | Tiempo de espera de la app: 15 s por petición, 60 s por parte de foto | confirmada |
| D63 | 006, 014 | n8n inserta el `eventId` en `n8n_inbox` después del envío SMTP: "al menos una vez" (puede repetir un correo si cae entre los dos pasos) | confirmada |
| D64 | 006 | La geocerca no suma la precisión del GPS | confirmada |
| D65 | 006 | Una entrega lleva de 1 a 3 fotos `FOTO_ENTREGA` (y un rechazo de 1 a 3 `FOTO_RECHAZO`) | confirmada |
| D66 | 006 | Evidencias `image/jpeg` o `image/png` de hasta 15 MB | confirmada |
| D67 | 006 | Subidas *multipart* abandonadas: `AbortIncompleteMultipartUpload` a los 7 días | confirmada |
| D68 | 007 | El rechazo del receptor guarda la distancia al destino pero no valida la geocerca | confirmada |
| D69 | 007 | Push por FCM: 5 intentos con espera exponencial | confirmada |
| D70 | 008 | La foto del recibo para el OCR no sale del navegador | confirmada |
| D71 | 009 | La foto del recibo de combustible es opcional | confirmada |
| D72 | 009 | Lecturas del sensor de combustible con TTL de 30 días | confirmada |
| D73 | 009 | El usuario MQTT `sensor-sim` solo puede publicar en `camion.*.combustible` | confirmada |
| D74 | 009 | El simulador de combustible reintenta la conexión al broker cada 5 s | confirmada |
| D75 | 010 | Revisión diaria de documentos de las unidades `DISPONIBLE` a las 06:00 `America/La_Paz` | confirmada |
| D76 | 010 | Atributos por tipo: tracto `capacidadTanqueLitros` 100–1.500; furgón `volumenM3` 10–120; plataforma `largoMetros` 6–15; cisterna `compartimentos` 1–6 y `capacidadLitros` 5.000–45.000 | confirmada |
| D77 | 013, 016 | La suscripción de alertas se cierra con `4403` para roles sin alertas (`cliente`, `chofer`) | confirmada |
| D78 | 013 | La probabilidad de retraso se recalcula como máximo una vez por minuto por viaje | confirmada |
| D79 | 013 | Variables del modelo de retraso de la spec 013, con horas planificadas = `distanciaKm / 55 km/h` | confirmada |
| D80 | 013 | Etiqueta `retrasado`: duración real > 1,25 × la planificada | confirmada |
| D81 | 013 | Modelo de retraso `GradientBoostingClassifier(random_state=42)` (la regresión logística es el recorte de nivel 2) | confirmada |
| D82 | 013 | Meta del modelo de retraso: recall de "retrasado" ≥ 0,75 en validación | confirmada |
| D83 | 013 | Alertas atendidas o resueltas: fuera de la campana a las 24 h; se guardan 90 días | confirmada |
| D84 | 013 | Puntaje de conducción: `max(0, 100 − 10 × (frenadas + 2 × fatigas) × 100 / km)` | confirmada |
| D85 | 014 | LLM del agente con temperatura 0 y 20 s por turno | confirmada |
| D86 | 014 | Máximo 3 acciones nuevas por misión | confirmada |
| D87 | 014 | Una acción `PENDIENTE` pasa a `ARCHIVADA` a las 24 h sin decisión o cuando su viaje termina | confirmada |
| D88 | 014 | Salida de una herramienta MCP: máximo 16 KB | confirmada |
| D89 | 014 | Límite de peticiones del MCP en memoria, con `maxInstances = 1` | confirmada |
| D90 | 014 | El MCP espera como máximo 15 s al servicio detrás de cada herramienta | confirmada |
| D91 | 014 | La auditoría del MCP va a los logs estructurados (el MCP no tiene base) | confirmada |
| D92 | 014 | Contrato de las herramientas MCP en `contratos/mcp/herramientas.md` | confirmada |
| D93 | 015 | Reportes: máximo 500 filas en pantalla y 10.000 en Excel | confirmada |
| D94 | 015 | Grabación de voz de hasta 15 s | confirmada |
| D95 | 015 | El texto transcrito se puede corregir antes de enviarlo | confirmada |
| D96 | 015 | Archivo de Excel de hasta 5 MB | confirmada |
| D97 | 016 | DataLoader sin filtro por ids: máximo 10 llamadas en paralelo | confirmada |
| D98 | 016, 015 | Tiempo de espera del Gateway: 3 s por llamada al componer pantallas; `preguntar` 60 s, `exportarReporte` 30 s, mutaciones simples 10 s; tiempo de espera de peticiones del Gateway en Cloud Run 3.600 s | confirmada |
| D99 | 016 | Reconexión de la suscripción: 1, 2, 4… s, máximo 30 s | confirmada |
| D100 | 016 | La barra revisa la disponibilidad de cada app cada 60 s con `/salud.json` | confirmada |
| D101 | 016 | GraphQL: profundidad máxima 8 y complejidad máxima 1.000 | confirmada |
| D102 | 010, 013 | Semilla de demo en archivos compartidos `plataforma/semilla/*.json` con ids y valores fijos; cada servicio, Analítica incluida, la carga directo en su base, sin escribir en el Outbox. Orden de `reiniciar-demo.sh`: detener relays y consumidores (incluido n8n) → purgar colas → `demo:reiniciar` en cada servicio → encender relays y consumidores | confirmada |
