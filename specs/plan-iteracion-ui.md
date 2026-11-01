# Plan: iteración de arreglos y pulido de UI (móvil primero)

> **Estado (2026-10-31):** Fases A (móvil), B y C hechas en `fix/app-chofer/pulido-movil`, con tres vueltas de revisión (`specs/revisiones/`). D60 ampliada. Decisiones 2, 3 y 4 quedan abiertas. Lo web pendiente está en `specs/pendientes-frontend-web.md`.

Fecha: 2026-10-31. Origen: prueba en iPhone y revisión del centro de control. Cada bloque es una rama `<tipo>/<pieza>/<que-se-hizo>` desde `develop`.

## Diagnóstico (lo que se encontró, con su causa)

| # | Síntoma | Causa encontrada | Dónde |
|---|---|---|---|
| 1 | Los íconos de la app se ven como cuadrados `☐` | `react-native-paper` dibuja con `MaterialCommunityIcons`, pero `@expo/vector-icons` no está instalado: no hay fuente | `movil/app-chofer/package.json` |
| 2 | Los íconos del centro de control salen como texto (`notifications`, `logout`) | Ningún `index.html` ni `styles` carga la fuente Material Symbols | `frontends/centro-control/projects/*/src/index.html` |
| 3 | `NOT NULL constraint failed: evidencia_local.tamano_bytes` al registrar la carga | `archivos.guardar` lee `destino.size` del mismo objeto `File` justo después de `copy()`; en iOS ese valor queda `null` hasta volver a leer el archivo | `src/datos/archivos.ts:16` |
| 4 | La caja del rostro sale en el lado contrario | `enVista` vuelve a espejar con `l.espejo`, pero con `enablePhysicalBufferRotation` el cuadro ya llega orientado como la vista previa: se espeja dos veces | `PantallaFatiga.tsx:144` |
| 5 | Con los ojos cerrados no hay alerta | La regla ya existe (`DetectorFatiga.ojos`, D60), pero el recorte no sigue al rostro: sin detector de rostro, la malla corre sobre la pared y devuelve EAR 0,29 (se ve en la captura: caja sobre la pared con «Ojos abiertos»). La malla de 468 puntos supone que ya le pasas un rostro | `src/datos/mallaFacial.ts` |
| 6 | Sin rostro (gorra, mano, mirada fuera) no avisa | Por diseño: `muestra(en, null)` solo corta el episodio | `src/dominio/fatiga.ts:60` |
| 7 | Alerta de fatiga sin GPS no se encola | `registrarFatiga` devuelve `null` si no hay posición; la pantalla no lo explica | `casosDeUso.ts:104` |
| 8 | Analítica «no da» (preguntas por voz) | `POST /voz/preguntas` → 503: el intercambio de token (RFC 8693) contra Keycloak responde **400**, así que no llega al MCP | `servicios/analitica/app/infraestructura/tokens.py:64` |
| 9 | Riesgo de retraso no aparece | `GET /predicciones/retraso/{id}` → 404 para ese viaje; la pantalla no distingue «sin predicción» de error | `cc-operaciones/.../viajes/ui/viaje.ts` |
| 10 | Callejones sin salida en el centro de control | Las páginas de detalle (`unidades/:id`, `viajes/:id`, `facturas/:id`, `combustible/:id`) no tienen «volver» ni migas | `cc-*/src/app/*/ui/*.ts` |
| 11 | Faltan procesos de gestión | Flota ya expone `POST/PUT /unidades` y `POST /unidades/{id}/baja`, y Viajes `GET /clientes`, pero el gateway no tiene mutaciones/consultas para ellas: no hay pantalla. Choferes y usuarios internos viven en Keycloak sin pantalla | `contratos/graphql/centro-control.graphql` |

## Fase A — Arreglos que rompen la demo (1 día)

1. **fix/app-chofer/iconos**: `npx expo install @expo/vector-icons` y nuevo `expo prebuild` + build (la fuente es nativa). Verificar en el simulador que el Appbar muestre `sync` y `logout`.
2. **fix/app-chofer/tamano-evidencia**: en `archivos.guardar`, devolver `new File(destino.uri).size` (o `destino.info().size`) y fallar con un mensaje claro si sigue sin tamaño. Prueba en `motorSincronizacion.test.ts` ya cubre el puerto; agregar una que rechace `tamanoBytes` nulo en `casosDeUso.evidencia`.
3. **fix/cc-ui-comun/fuente-iconos**: cargar Material Symbols en el `index.html` de las 4 apps (o empaquetarla con `material-symbols` desde npm para no depender de Google Fonts en la nube).
4. **fix/analitica/intercambio-token**: reproducir el 400 (mirar `error_description` de Keycloak), revisar en `plataforma/keycloak/*.json` que el cliente de analítica tenga *token exchange* habilitado y permiso sobre la audiencia del MCP. Si la falla es de configuración, va en `plataforma`; no se toca el contrato.
5. **fix/cc-operaciones/sin-prediccion**: 404 de predicción = «Aún no hay datos para estimar el retraso», no error.

## Fase B — Detector de fatiga que sí detecta (2–3 días)

**No hace falta escribir un modelo.** MediaPipe ya publica **Face Landmarker** (`face_landmarker.task`, Apache 2.0). El `.task` es un zip con tres `.tflite` que corren con el `react-native-fast-tflite` que ya usamos:

- `face_detector.tflite` (BlazeFace): dice si hay rostro y dónde. Arregla el recorte (causa 5) y el «rostro» falso sobre la pared.
- `face_landmarks_detector.tflite`: la malla de 478 puntos (reemplaza la `face_landmark.tflite` actual).
- `face_blendshapes.tflite`: 52 puntajes ya calibrados, entre ellos `eyeBlinkLeft`, `eyeBlinkRight`, `jawOpen`. Con ellos el EAR casero pasa a respaldo.

Alternativa más simple si lo anterior se complica con Vision Camera 5: Google ML Kit Face Detection da `leftEyeOpenProbability`/`rightEyeOpenProbability` y los ángulos de la cabeza, pero hoy no hay plugin probado para Vision Camera 5 (Nitro). Por eso la recomendación es Face Landmarker sobre lo ya instalado.

Pasos:

1. `scripts/descargar-modelo.sh`: bajar `face_landmarker.task` y descomprimir los tres `.tflite` en `assets/modelos/`.
2. `mallaFacial.ts`: detector → recorte del rostro → malla → blendshapes. Si el detector no ve rostro, `caja: null` (nunca la malla sobre la nada).
3. `PantallaFatiga.enVista`: quitar el doble espejo; probar con la cara a un lado y confirmar que la caja la sigue.
4. `dominio/fatiga.ts`, reglas nuevas (con pruebas en `fatiga.test.ts`):
   - `OJOS_CERRADOS`: `eyeBlink` promedio ≥ 0,5 durante 1,5 s (D60 sigue igual en tiempo).
   - `SOMNOLENCIA` (PERCLOS): ojos cerrados > 30 % del último minuto. Es la medida estándar de somnolencia, detecta el parpadeo lento que no llega a 1,5 s.
   - `CABECEO`: la cabeza cae (pitch, sale de la matriz de la malla) más de 20° durante 1 s.
   - `SIN_ROSTRO`: no se ve el rostro, o se ve sin ojos (gorra, mano, mirada fuera), durante 3 s seguidos.
   - `BOSTEZOS`: igual que hoy, con `jawOpen` ≥ 0,6.
5. Si no hay GPS, encolar igual con la última posición conocida o avisar en pantalla «Alerta guardada sin ubicación» (causa 7).

**Decisión que hay que confirmar antes (regla de AGENTS.md):** D60 dice solo «ojos cerrados ≥ 1,5 s o 3 bostezos». Agregar `SOMNOLENCIA`, `CABECEO` y `SIN_ROSTRO` cambia D60. El contrato no cambia: el evento solo lleva `tipo: ALERTA_FATIGA`, sin motivo. Si se quiere el motivo en el servidor, hay que agregar `motivoFatiga` a `EventoConduccionNuevo` y al esquema del evento en el mismo commit.

## Fase C — Pulido de la app del chofer (`/impeccable`, 3–4 días)

Principios: una tarea por pantalla, acción principal abajo y al alcance del pulgar, estados vacíos/carga/error con salida, nada de texto técnico al chofer.

1. **Navegación**: título que no se corte («Carga de combustible» → «Combustible»), atrás siempre visible y coherente con el gesto de iOS (hoy solo hay `BackHandler` de Android). Evaluar `@react-navigation/native-stack` para tener gesto de deslizar y transición nativa; si no, mantener la máquina de estados actual y agregar el gesto.
2. **Errores**: nunca mostrar excepciones nativas (captura 1). Mapear a frases: «No se pudo guardar la foto. Vuelve a tomarla.» y dejar el detalle en el log.
3. **Barra de sincronización**: «Todo enviado» ocupa una franja fija en cada pantalla. Pasarla a un indicador pequeño en el Appbar y mostrar la franja solo con pendientes o errores.
4. **Formulario de carga**: unidades dentro del campo (`L`, `Bs`, `km`), validación al salir del campo, teclado con «Siguiente», botón principal deshabilitado hasta tener datos válidos y foto, miniatura con «quitar».
5. **Detector**: pantalla completa con guía de encuadre (óvalo), estado grande y legible a un brazo de distancia, alerta a pantalla completa en rojo con botón «Estoy bien» de 56 pt; ocultar EAR (es dato técnico) o mostrarlo solo en modo depuración.
6. **Pantalla del viaje**: las cuatro acciones como cuadrícula 2×2 con ícono grande y etiqueta, la acción del momento (iniciar / entregar) destacada.
7. **Accesibilidad**: objetivos ≥ 44 pt, `accessibilityLabel` en todo `IconButton`, contraste AA con el tema oscuro, soportar texto grande del sistema.

## Fase D — Centro de control: navegación y gestión (`/frontend-ui-engineering`, 4–5 días)

1. **Salidas**: componente `cc-encabezado` en `ui-comun` con migas («Unidades › ABC-123») y botón volver en todas las páginas de detalle. Menú lateral por app con las secciones (hoy solo hay enlaces entre apps en la barra).
2. **Gestión de unidades (cc-flota)**: alta, edición y baja de unidades. El REST ya existe; falta en `contratos/graphql/centro-control.graphql` (`crearUnidad`, `editarUnidad`, `darBajaUnidad`, con `Idempotency-Key` en la creación) → resolver en el gateway → formulario y diálogo de confirmación.
3. **Clientes (cc-operaciones)**: lista y detalle de clientes (`GET /clientes` ya existe) con su línea de crédito. Solo lectura y alta por el flujo 001; nada de varios usuarios por cliente (fuera de alcance).
4. **Choferes y usuarios internos**: hoy salen de Keycloak. Opción mínima: página de choferes de solo lectura (`GET /choferes`) y un enlace a la consola de administración de Keycloak para altas y roles. Construir un CRUD de usuarios propio es una spec nueva (contrato, seguridad, intercambio de token): **decidir antes de empezar**.
5. **Rutas**: solo hay lectura. Si se quiere gestionarlas, hace falta spec y contrato nuevos en Viajes.
6. **Consistencia visual**: un solo patrón de tabla (filtro arriba, acciones por fila, vacío con llamada a la acción), íconos con significado único (no el mismo ícono para dos acciones) y estados de carga con esqueleto.

## Orden sugerido

A (todo) → B → C → D. A y la parte de navegación de D no dependen entre sí y pueden ir en paralelo. Para la Fase D, puntos 2–5, cada contrato nuevo va primero en `contratos/` y su spec en `specs/`.

## Pendiente de decidir

1. ¿Se amplía D60 con `SOMNOLENCIA`, `CABECEO` y `SIN_ROSTRO`? ¿Se manda el motivo al servidor?
2. ¿Gestión de usuarios propia o consola de Keycloak?
3. ¿Gestión de rutas entra en esta iteración?
4. ¿React Navigation en la app o se mantiene la navegación por estado?

Al terminar: anotar para ICONIX los nuevos estados del detector y las operaciones de gestión de unidades (no editar `.docx` ni `.eap`).
