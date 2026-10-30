# App del chofer

React Native + Expo SDK 57 (nueva arquitectura, Hermes), React Native Paper con el tema de `libs/design-tokens` (D46, D47). Offline-first (spec 005): toda escritura va primero a una cola en SQLite con su `opId` y el motor la envía al recuperar la señal.

## Capas (Clean)

| Carpeta | Qué hay | Importa |
|---|---|---|
| `src/dominio` | Cola y su orden, reintentos (*full jitter*, base 1 s, máximo 5 min, `Retry-After` manda), reglas del viaje local | Nada |
| `src/aplicacion` | Puertos, `MotorSincronizacion` y casos de uso (descargar viajes, iniciar, encolar, registrar el dispositivo) | Dominio |
| `src/datos` | SQLite con Drizzle (`esquema.ts`, migraciones en `drizzle/`), cliente Orval de `contratos/openapi`, sesión de Keycloak, red, tarea en segundo plano, raíz de composición | Aplicación y dominio |
| `src/presentacion` | Pantallas Paper y el *hook* de los disparadores del motor | Todo |

Dominio y aplicación son TypeScript puro y se prueban con Vitest y puertos falsos (`npm test`).

## Motor de sincronización (spec 005, CU-08)

- Una tanda a la vez: renueva el access token con el refresh token *offline* (D27) y, si da `invalid_grant`, pide iniciar sesión **sin borrar la cola**.
- **Cerrar sesión** es otra cosa: si quedan registros o puntos GPS sin enviar, la app avisa y pide confirmación; luego detiene el GPS y la tarea de fondo, quita el token push del registro (`PUT /dispositivos/mio` sin `tokenPush`), revoca el refresh token en Keycloak (`revoke`, 15 s como máximo) y borra del celular los viajes, la cola, las evidencias, los puntos GPS y la última posición. Quedan el `dispositivoId` y el `seq` de cada viaje (D55).
- Al bajar `GET /viajes/mios`, los viajes que ya no vienen se borran del celular, salvo los que tienen operaciones pendientes.
- Por viaje, una petición a la vez y en orden: `INICIO`, luego hitos, eventos y cargas por hora de creación, la entrega al final.
- Red, 5xx, 429, `409 IDEMPOTENCIA_EN_PROCESO` y `409 CONFIRMACION_EN_CURSO` se reintentan con la misma clave. Otro 4xx deja la operación `FALLIDA` con su código. Un `409 CONFLICTO_ESTADO` con el viaje `CANCELADO` descarta la cola de ese viaje (7 días en Descartadas, D54) y avisa "Viaje cancelado; llama al despachador"; si no se puede consultar el estado del viaje (red, 5xx), la operación se reintenta. Un error inesperado al enviar una operación la reintenta sin romper la tanda.
- El GPS sale después del inicio confirmado, en lotes de hasta 100, uno a la vez; un 503 con `Retry-After` (FO4) solo hace crecer "Pendientes". Al abrir, el cursor del dispositivo (D55) borra lo que el servidor ya aceptó; esa limpieza nunca bloquea la sincronización inicial.
- Disparadores: cambio de conectividad, app al frente, cada 90 s y la tarea en segundo plano.

## GPS y frenadas (T7.3)

- `expo-location` en segundo plano (servicio en primer plano en Android, indicador azul en iOS) mientras haya un viaje en ruta, aunque el inicio siga en la cola. Cada lectura pasa por el muestreo de D52 (un punto cada 20 s o cada 100 m) y se guarda con un `seq` creciente por viaje que no se reinicia al borrar lo enviado.
- `expo-sensors` (DeviceMotion a 10 Hz, con la app al frente): una frenada es brusca desde 0,4 g sostenida 300 ms a más de 20 km/h, como mucho una cada 10 s (D08, D59). Va a la cola como `EVENTO_CONDUCCION` con la última posición del GPS.
- El inicio del viaje lleva la última posición conocida.

## Bitácora por voz (T7.4)

- Whisper `base` (`ggml-base-q5_1.bin`, 60 MB, D38) en el celular con `whisper.rn`: `scripts/descargar-modelo.sh` lo baja antes del build (`prestart`, `preios`, `preandroid`; no se versiona) y viaja como asset.
- El chofer dicta (WAV PCM 16 kHz mono con `expo-audio`), revisa el texto, elige el tipo y guarda: el hito va a la cola con la última posición. El audio se borra al transcribir y nunca sale del celular (D53).
- A más de 5 km/h el texto no se puede escribir, solo dictar (D58).
- Android no graba WAV con `MediaRecorder` (PoC-4): ahí el dictado queda pendiente de un adaptador PCM y el chofer escribe con el camión detenido.

## Entrega, rechazo y combustible (T7.5 y T7.6)

- Fotos con la cámara (la galería si no hay cámara, como en el simulador) en JPEG comprimido y firma del receptor dibujada con el dedo (PNG). Se copian al almacenamiento de la app y se registran en SQLite como evidencias.
- La entrega (1 a 3 fotos, firma opcional con el nombre de quien recibe), el rechazo en destino (motivo y fotos) y la carga de combustible (litros, monto, kilometraje y foto del recibo) van a la cola. El viaje deja de estar en ruta en el celular y el GPS se detiene.
- El monto de la carga se valida como texto (`^\d{1,12}([.,]\d{1,2})?$`) y se normaliza a `"675.50"` sin pasar por `number` (000 §3).
- Antes de enviar, el motor sube sus evidencias por partes de 5 MB con URL firmadas de S3, de a 2 (D61), 60 s por parte (D62). Abrir la subida es idempotente por `evidenciaId` y devuelve las partes que S3 ya tiene: un corte retoma solo las que faltan.
- La carga va a Flota con `Idempotency-Key` igual al `opId` del cuerpo (spec 009).

## Detector de fatiga (T7.7, D60)

- Pantalla "Detector de fatiga" del viaje en ruta: la cámara frontal **en primer plano** (iOS no la deja en segundo plano) con VisionCamera 5 y un *frame processor* (`react-native-worklets`).
- Cada cuadro (VGA, RGB, ya rotado) se recorta alrededor del rostro, se escala a 192 × 192 y pasa por la malla facial de MediaPipe (`face_landmark.tflite`, 1 MB) con `react-native-fast-tflite`. `scripts/descargar-modelo.sh` baja el modelo junto con el de Whisper. El recorte sigue al rostro del cuadro anterior, como en MediaPipe.
- Solo salen del hilo de la cámara 16 puntos (ojos y boca) y la caja del rostro; el cuadro se libera ahí mismo y ninguna imagen se guarda.
- El dominio (`dominio/fatiga.ts`) calcula la apertura de los ojos (EAR < 0,2) y de la boca (MAR > 0,6): ojos cerrados 1,5 s o más, o 3 bostezos de al menos 1 s en 2 minutos → alarma (`assets/alarma.wav` y vibración) y un `EVENTO_CONDUCCION` `ALERTA_FATIGA` en la cola, con la última posición. Una alerta por episodio.
- La pantalla dibuja la caja del rostro con la etiqueta de los ojos y el conteo de bostezos (FO6). La prueba con la cámara real queda para el iPhone (el simulador no tiene cámara).

## Notificaciones push (T7.8, D45)

- Solo Android (con la cuenta gratuita de Apple no hay push en iPhone). Al iniciar sesión la app crea el canal `viajes`, pide permiso y registra su token nativo de FCM con `PUT /dispositivos/mio`.
- "Viaje asignado" o "Viaje cancelado" baja los viajes de nuevo; tocar la notificación abre el viaje (también con la app cerrada, `getLastNotificationResponseAsync`).
- `google-services.json` no se versiona y solo se usa si Firebase tiene registrada la app (`APP_ANDROID_PACKAGE`, por defecto `bo.transporte.chofer`); si no, el build de Android va sin push. Para probar con la app de la PoC: `APP_ANDROID_PACKAGE=bo.transporte.poc.chofer`.
- El emulador de Android no resuelve `<mac>.local` (PoC-4): para iniciar sesión ahí hace falta otra forma de llegar a Keycloak con el mismo issuer.

## Correr

```bash
npm ci
APP_MAC_LOCAL=<tu-mac>.local npx expo prebuild --platform ios
LANG=en_US.UTF-8 APP_MAC_LOCAL=<tu-mac>.local npx expo run:ios
```

| Variable | Para qué |
|---|---|
| `APP_ENTORNO` | `local` (por defecto: compose en la Mac por `<mac>.local`, que resuelven el simulador de iOS y el iPhone) o `nube` (F11, con `APP_VIAJES_URL`, `APP_FLOTA_URL` y `APP_OIDC_ISSUER`) |
| `APP_MAC_LOCAL` | El nombre `.local` de la Mac; debe coincidir con `OIDC_ISSUER` de `plataforma/compose/.env` |

`ios/` y `android/` se generan con `expo prebuild` y no se versionan. `google-services.json` (FCM, D45) se agrega fuera del repo.

| Comando | Qué hace |
|---|---|
| `npm run verificar` | Tipos, ESLint, Prettier y Vitest |
| `npm run generar:contratos` | Regenera el cliente de `contratos/openapi` (CI falla si no coincide) |
| `npm run empaquetar` | Baja el modelo y empaqueta iOS y Android con `expo export` (CI: atrapa módulos que Metro no resuelve) |
| `npm run generar:migraciones` | Crea la migración de Drizzle al cambiar `src/datos/esquema.ts` |
