# Revisión de la app móvil, vuelta 3 (`movil/app-chofer`)

Rama revisada: `fix/app-chofer/pulido-movil` (sin commit), `git diff develop -- movil/app-chofer`. Alcance: el estado real de los hallazgos de `movil-fase-a.md`, `movil-fase-b.md` y `movil-fase-c.md`, las regresiones de sus correcciones y el flujo del chofer de punta a punta. Todo sale de leer el código: no se probó en un dispositivo.

## `npm run verificar`

En verde: `tsc --noEmit`, `eslint .`, `prettier --check src` y vitest (5 archivos, 57 pruebas). Solo sale el aviso de Vite por `vitest.config.ts`. `npm ls expo-font` da una sola copia, la 57.0.4.

## Transacción de `conEvidencias` (verificado en drizzle)

`contenedor.ts:34` pasa `(fn) => bd.transaction(() => fn())`. En `drizzle-orm/expo-sqlite/session.js`, `ExpoSQLiteSession.transaction` es síncrona: corre `begin` con `this.run(...)`, llama al callback y hace `commit`, o `rollback` si lanza. `this.run` prepara la sentencia con `this.client.prepareSync`, donde `client` es la misma conexión de `openDatabaseSync` que usa el `bd` global. Los repositorios escriben con `bd.insert/update(...).run()`, que pasa por esa misma sesión y esa misma conexión. Por eso sus escrituras quedan dentro del `begin … commit` aunque no usen `tx`. Dentro de la transacción no hay otro `bd.transaction` (`guardarDelServidor` y `DatosDelChoferSqlite.borrar` no se llaman desde `conEvidencias`), así que no hay `BEGIN` anidado. Todo es síncrono (`copySync`, `executeSync`): ninguna otra escritura de la app puede meterse entre `begin` y `commit`. Con esto, C-1 y A-2 quedan resueltos.

## (a) Estado de los hallazgos anteriores

| id | estado | nota |
|---|---|---|
| A-1 | resuelto | `expo-font` 57.0.4 directa y única |
| A-2 | resuelto | Filas, operación y marca en una sola transacción, y las copias se borran si falla |
| A-3 | resuelto | `archivos.ts:19-21` borra la copia vacía y usa un texto neutro |
| A-4 | resuelto | Las pantallas pasan por `mensajeDe`; no queda ningún `(e as Error).message` |
| A-5 | resuelto | Texto propio y el detalle a `console.error` |
| A-6 | resuelto | Sin fila o sin archivo: 422 `EVIDENCIA_PERDIDA`, que termina en FALLIDA |
| A-7 | resuelto | Borrado protegido y `setEstado('listo')` en el `finally` |
| A-8 | resuelto | Permiso, preparación y `stop` dentro del `try` |
| A-9 | resuelto | `.catch(() => setGps('detenido'))` |
| A-10 | resuelto | `onPanResponderTerminationRequest: false` (falta verificarlo en el dispositivo) |
| A-11 | no resuelto | `archivos.guardar` sigue sin normalizar la ruta de `captureRef` sin `file://` (a verificar en Android) |
| A-12 | resuelto | `useFonts` en `App` (ver V-4) |
| A-13 | resuelto | Cerrojo con `useRef` y `errorFotos` visible |
| A-14 | resuelto | Todo dentro del `try`; con el permiso negado, el aviso de Ajustes |
| A-15 | resuelto | `.catch(() => setEstado('sin-sesion'))` |
| A-16 | resuelto | `volverA` en Pendientes |
| A-17 | resuelto | `exigirEnRuta` en hito, entrega, rechazo y combustible |
| A-18 | resuelto | Ver C-21 |
| A-19 | resuelto | «Buscando tus viajes…» mientras corre la primera descarga |
| A-20 | resuelto | La copia se borra al quedar COMPLETA |
| A-21 | pendiente a propósito | worklets 0.13 |
| B-1 | resuelto | Repite con `didJustFinish`, vibración en bucle y limpieza al desmontar (ver C-18) |
| B-2 | resuelto | Rebase a los 10 s y mediana de los primeros 2 s |
| B-3 | resuelto | El recorte gira; la transformación de `alCuadro` y la de `muestrear` coinciden |
| B-4 | resuelto | `α = 1 − exp(−dt/τ)`, con prueba a 30 cuadros por segundo |
| B-5 | resuelto | `onFrameDropped: () => {}` |
| B-6 | resuelto | `abierta` evita encolar dos veces por alerta |
| B-7 | pendiente a propósito | Alerta sin GPS |
| B-8 | resuelto | `outputs` memorizado; `setCuadro` solo si `cambioVisible` |
| B-9 | pendiente a propósito | Rendimiento (verificar en el iPhone) |
| B-10 | resuelto | `rostroVisible`: «No se ve bien tu rostro» |
| B-11 | resuelto | Comentario corregido |
| B-12 | resuelto | `salidas[1]` explícito |
| B-13 | pendiente a propósito | Rostros chicos |
| B-14 | pendiente a propósito | Umbral de ojos |
| B-15 | resuelto | `catch` en el worklet |
| B-16 | resuelto | `announceForAccessibility`, botón a todo el ancho de 64 dp, etiqueta de 18 pt y `bodyLarge` |
| B-17 | resuelto | prettier en verde |
| B-18 | resuelto | El README dice «cuatro números» |
| B-19 | pendiente a propósito | SIN_ROSTRO con el camión detenido |
| C-1 | resuelto | Transacción verificada en drizzle (ver arriba); cada borrado del `catch` va por su lado |
| C-2 | resuelto | `REBASE_CABECEO_MS` vuelve a armar el aviso, con prueba |
| C-3 | resuelto | Mediana de los primeros 2 s, con prueba. Lo de la gorra queda a verificar en el dispositivo |
| C-4 | resuelto | Dos estados separados (`observacion` y `motivo`) y tope de 300 en `rechazar` |
| C-5 | resuelto a medias | Diálogo de confirmación y botón rojo en modo rechazo, pero el resumen puede mentir (V-1) |
| C-6 | resuelto | Un `Button` «Quitar» bajo cada miniatura |
| C-7 | resuelto | Botones activos que muestran el error al tocarlos. El comentario de `PantallaCarga.tsx:37` promete «se va al primero», pero no enfoca ningún campo |
| C-8 | resuelto a medias | `automaticallyAdjustKeyboardInsets` e `interactive` puestos. En iOS, `decimal-pad` sigue sin «Listo» (sin `InputAccessoryView`); falta verificarlo en el dispositivo |
| C-9 | resuelto | `scrollEnabled={!firmando}` con `alFirmar` |
| C-10 | resuelto | Sin `compact` y con `icon="eraser"` |
| C-11 | resuelto | `plural(item.intentos, …)` |
| C-12 | resuelto | «Avisa al despachador», ícono de color de error y `loading` (ver V-6) |
| C-13 | resuelto | `enviando` con spinner y Snackbar (ver V-3) |
| C-14 | resuelto | Cerrojo con `useRef` |
| C-15 | resuelto | Botón «Ver mis viajes» |
| C-16 | resuelto | Chips con `flexWrap` y 44 dp, el permiso dentro del `try` y `setError(null)` |
| C-17 | resuelto | `setFalloCuadro(false)` en `alLeer` |
| C-18 | pendiente a propósito | Repetición con `useAudioPlayerStatus` |
| C-19 | resuelto | Rojo fijo `#ba1a1a` con texto blanco |
| C-20 | resuelto | La galería solo con `__DEV__`. En un dev client sobre el iPhone, `__DEV__` también es true |
| C-21 | resuelto | `conError` en `sinEnviar` y en el diálogo |
| C-22 | resuelto | Se prueba la lectura antes de subir; un archivo que no abre da `EVIDENCIA_PERDIDA` |
| C-23 | resuelto | Mensaje de error en la primera descarga |
| C-24 | resuelto a medias | El texto usa `puntos.contar(viajeId)`, pero `PantallaViaje.tsx:42` sigue con `useLiveQuery(bd.select().from(puntoGps))`, que (según `drizzle-orm/expo-sqlite/query.js`) vuelve a leer toda la tabla con cada punto nuevo |
| Gesto atrás en iOS | pendiente a propósito | Decisión 4 del plan: se queda la navegación por estado |

## (b) Hallazgos nuevos

| id | severidad | archivo:línea | problema | corrección propuesta |
|---|---|---|---|---|
| V-1 | media | `src/presentacion/pantallas/PantallaEntrega.tsx:31-36`, `:44`, `:129` | El resumen del diálogo de entrega se arma con `receptor`, no con si hay firma. Con un nombre escrito y sin firmar, dice «Recibe: Juan», pero la entrega sale sin firma (queda en revisión) y el nombre se pierde sin aviso. Con firma y sin nombre, dice «Sin firma (queda en revisión)», que es falso, y recién después de confirmar sale el error «Escribe el nombre de quien recibe». | Exponer `firmada(): boolean` en `FirmaRef` (`trazos.length > 0`). En `pedirConfirmacion`, si hay firma y el nombre tiene menos de 3 caracteres, mostrar el error antes del diálogo. En el diálogo: «Firmó: {receptor}» o «Sin firma (queda en revisión)» según `firmada()`. |
| V-2 | media | `src/presentacion/pantallas/PantallaViaje.tsx:62`, `:112-120` y `src/dominio/viaje.ts:35-36` | Si la ENTREGA, el RECHAZO o el INICIO terminan FALLIDA (por ejemplo, `EVIDENCIA_PERDIDA` o `VALIDACION`), `entregaLocal`/`iniciadoLocal` no se limpian nunca (`guardarDelServidor` los conserva). El viaje se queda en «Entregado» o «En ruta» y sigue diciendo «se envía con las fotos al recuperar la señal», que ya es falso. El chofer no puede volver a registrar la entrega y no tiene cómo salir de ahí. Ya venía de antes; no lo trajeron las correcciones. | En `PantallaViaje`, buscar en la cola la operación de ese tipo para el viaje. Si está FALLIDA, cambiar el texto por «La entrega no se pudo enviar. Avisa al despachador» y agregar un botón a Pendientes. Si se quiere permitir reintentar, limpiar `entregaLocal` al cerrar como FALLIDA una ENTREGA o un RECHAZO (`motorSincronizacion.cerrar`), pero eso hay que confirmarlo antes en la spec 006/007. |
| V-3 | baja | `src/presentacion/App.tsx:168-172` | «Enviar ahora» dice «Envío al día» siempre que `r.sinConexion` sea false, aunque haya operaciones reprogramadas (503, 429, una parte que no llegó) o en espera por `proximoIntentoEn`, que `siguiente` salta. La barra sigue mostrando «N por enviar» justo debajo del mensaje. | Al terminar, leer `sync.pendientes + sync.puntos` (o devolver en `Resumen` cuántas siguen pendientes) y decir «Quedan N por enviar; se reintenta solo» cuando no es 0. |
| V-4 | baja | `src/presentacion/App.tsx:51`, `:61` | `const [fuentes] = useFonts(...)` ignora el error. Si la fuente no carga, `fuentes` queda en false y la app se queda en el spinner para siempre, sin salida al abrirla. | `const [fuentes, errorFuentes] = useFonts(...)` y seguir con `fuentes \|\| errorFuentes` (los íconos solo salen vacíos). |
| V-5 | baja | `src/presentacion/pantallas/PantallaViaje.tsx:139` | Un viaje CONFIRMADO mientras hay otro EN_RUTA no muestra el botón «Iniciar viaje» ni explica por qué. El chofer ve «Confirmado» y nada más. | Si `estado === 'CONFIRMADO'` y no `puedeIniciar`, mostrar «Termina el viaje en ruta para iniciar este». |
| V-6 | baja | `src/presentacion/BarraSincronizacion.tsx:30` y `src/datos/repositorios.ts:60-63` | `purgar` solo borra DESCARTADA y CONFIRMADA, así que una FALLIDA no se va hasta cerrar sesión. El `Banner` «N registros no se pudieron enviar» queda fijo en todas las pantallas, Fatiga incluida (le quita alto a la cámara), y no hay cómo cerrarlo. | Agregar la acción «Entendido» al banner y guardar en memoria el número de FALLIDA ya vistas. Que el banner solo vuelva a salir si sube ese número. |
| V-7 | baja | `src/aplicacion/casosDeUso.ts:243-276` | La limpieza de `conEvidencias` (borrar las filas y las copias cuando algo lanza a mitad) no tiene prueba: los tests construyen `CasosDeUso` con el `enTransaccion` por defecto y ninguno hace fallar la segunda foto, la cola ni la marca. | Una prueba con un `Archivos` falso que lance en la segunda copia y una `Cola` que lance en `agregar`. Comprobar que se llamó `archivos.borrar` por cada copia y que el error original se propaga. |

## Flujo de punta a punta (leído en el código)

Abrir la app → migración (con un texto propio si falla) → fuente (V-4) → sesión (spinner con `catch`) → login (error de red visible; si cancela, vuelve sin mensaje) → «Buscando tus viajes…» o el error → viaje (V-5) → iniciar (cerrojo y errores de GPS visibles) → bitácora (en Android y en movimiento, «Detén el camión»), combustible y fatiga (alarma hasta «Estoy bien», limpieza al salir) → entrega o rechazo con confirmación (V-1) → vuelve al viaje con «registrada» (V-2 si falla) → Pendientes (V-6) → cerrar sesión con el conteo de pendientes y de errores. Todas las pantallas que no son la raíz tienen `Appbar.BackAction` y el atrás de Android. Fuera de V-2 y V-4 no encontré callejones sin salida ni textos técnicos en pantalla.

## No verificado

Nada se probó en un dispositivo. Quedan para el iPhone o Android: A-10/C-9 (firma), A-11 (ruta de `captureRef` en Android), C-8 (teclado numérico), lo de la gorra de C-3 y los pendientes a propósito B-9, B-13, B-14 y C-18.

## Aplicado después de esta vuelta

V-1 a V-7, A-11 (ruta sin `file://`) y C-24 quedaron resueltos en la misma rama; `npm run verificar` pasa con 58 pruebas. V-2 solo avisa y lleva a Pendientes: permitir volver a registrar una entrega rechazada necesita confirmarse en las specs 006/007. Siguen abiertos: C-8 (tecla «Listo» del teclado numérico en iOS) y lo que se verifica en el iPhone (B-9, B-13, B-14, C-3, C-9, firma en Android), además de los pendientes a propósito (A-21, B-7, B-19, C-18, gesto atrás en iOS).

## Verificación por dentro en el simulador (iPhone 17 Pro, chofer de prueba)

Recorrido: inicio de sesión → Mis viajes → Viaje → Combustible → Pendientes → menú → Bitácora → Entrega → Fatiga, en claro y oscuro. Corregido en la misma pasada:

- **Caída al salir de Fatiga** (`PantallaFatiga.tsx`): la limpieza llamaba a `alarma.pause()` con el reproductor ya liberado por `useAudioPlayer`. Ahora al desmontar solo se corta la vibración.
- Cuadrícula del viaje con 3 tarjetas en la primera fila: ahora dos filas de dos.
- Fecha en ISO (`2026-12-19`) → `19 dic 2026` (`fechaCorta` en `textos.ts`).
- Aviso del GPS sin salida: botón «Ajustes» que abre los ajustes de la app.
- Combustible: huecos por los mensajes de error reservados; cada campo va junto a su mensaje.
- Aviso «N registros no se pudieron enviar»: era un banner alto con ícono negro; ahora es una fila con color de error, «Ver» y cerrar, y no sale en Pendientes.
- Bitácora: el tipo elegido se distingue (relleno vs. contorno) y «Dictar» queda un escalón bajo «Guardar».
- Entrega: «Toma al menos una foto» sale en la sección de fotos.

Probado de punta a punta: una carga de prueba llegó a Flota y Flota la rechazó con `KILOMETRAJE_INVALIDO` (regla real: el kilometraje era menor que el anterior); Pendientes lo muestra con su motivo. No probado en el simulador: la foto (la cámara virtual no entrega imagen) y el detector de fatiga (no hay cámara frontal).
