# Revisión Fase E (commit `ced8d5d`)

Alcance: solo el commit `ced8d5d` («valida los formularios por campo, mapea errores y reduce la fuente de iconos»), solo frontend. Revisado con `git show` sobre una copia del commit fuera del worktree, sin build ni pruebas en el worktree.

Qué se comprobó y está bien:

- La fuente recortada pesa 12 960 bytes. Con `hb-shape` sobre la copia, los 85 nombres de `ICONOS` forman ligadura.
- Todo icono que hoy aparece en plantillas, en `icono: '…'`, en `icono="…"` y en `e(…)` está en la lista (`node scripts/iconos.mjs --usados` corrido sobre la copia).
- El mapa `codigo → frase` cubre todos los códigos HTTP de 000 §5. `RESUELTO_MANUALMENTE` y `CANCELADO_POR_USUARIO` no se devuelven por HTTP.
- `mensajeDe` ya no muestra `message` ni `detail`.
- Los montos se validan como texto y en centavos (`bigint`).
- El doble envío está cubierto en pago, programar, cierre, voz y cancelar.
- `Intentos` reutiliza la clave cuando se reenvían los mismos datos.
- Contraste: on-surface-variant sobre surface da 8,9 en claro y 10,9 en oscuro. on-advertencia-container sobre su contenedor da 13,3.
- Todas las `cc-pie-lista` reciben `[cargando]`.

| id | sev | archivo:línea | problema | arreglo concreto |
|---|---|---|---|---|
| E-1 | P2 | `ui-comun/src/lib/formulario.ts:32` (lo usan `viaje.ts:75,115`, `aprobaciones.ts:75`, `servicios.ts:109`, `voz.ts`) | El selector `[formControl].ng-invalid` nunca coincide. Un `[formControl]="x"` es un binding de propiedad y Angular no lo escribe como atributo en el DOM. Por eso, en todos los formularios de un solo control (motivo de entrega, nota de intervención, motivo de crédito, motivo de cancelar, pregunta por voz), «enfocar el primero inválido» no hace nada y el foco queda en el botón. La prueba de `formulario.spec.ts` arma el DOM a mano con `formControlName` y no lo detecta. | Marcar los campos con un atributo estático. Por ejemplo, el selector `.ng-invalid:is(input,textarea,mat-select,[formControlName])`, o buscar `.mat-mdc-form-field-invalid input, .mat-mdc-form-field-invalid textarea, .mat-mdc-form-field-invalid mat-select` después de `markAllAsTouched()` y de una detección de cambios. Agregar a la prueba un caso con un componente real que use `[formControl]`. |
| E-2 | P2 | `ui-comun/src/lib/aviso-servicios.ts:67-70` | Ninguna página pasa `[reintentar]` (grep: 0 de 29 `cc-aviso-servicios`), así que «Reintentar» siempre hace `location.reload()`. En una ficha con un formulario abierto (pago a medio llenar, mensaje de acción editado, motivo escrito), un fallo parcial del sondeo pone el banner, y reintentar descarta lo escrito y las claves vivas de `Intentos`: un reintento posterior sale con otra clave. | Pasar `[reintentar]="recargar"` desde cada fachada (todas tienen `recargar()` o pueden exponer `refetch` de Apollo). Dejar `location.reload()` solo si no hay formulario, o quitarlo. |
| E-3 | P2 | `ui-comun/src/lib/confirmacion.ts:23` y sus usos (`factura.ts:155,267`, `unidad.ts:199,325`, `viaje.ts:101,300`, `acciones.ts:111,197`) | Con «No, volver», o cuando el envío falla y se hace `confirmando.set(false)`, `cc-confirmacion` desaparece con el foco dentro y el foco cae en `<body>`. El teclado y el lector de pantalla pierden el lugar. Pasa lo mismo tras el éxito cuando el botón que abrió el formulario deja de existir (saldo 0 en `factura.ts:253`; unidad que pasa a `EN_MANTENIMIENTO` en `unidad.ts:290`). | En `volver` y en el `catch`, llevar el foco al botón que pidió la confirmación con el `enfocar(id)` que ya existe (darle `id` a «Guardar el pago», «Cerrar mantenimiento», «Rechazar»…). Tras el éxito, si el botón ya no está, enfocar el `<h1>` del encabezado o el aviso de resultado. |
| E-4 | P2 | `viaje.ts:94,281-283` (igual `factura.ts:150,257`) | Mientras la confirmación está abierta, el campo sigue editable. En viaje, se puede borrar el motivo después de «Rechazar» y confirmar: `rechazar()` no vuelve a validar y envía `motivo: ''`, que da `400 VALIDACION` (spec 007). En factura, `registrar()` hace `return` en silencio si el formulario quedó inválido, y el resumen, que se calcula en vivo, cambia bajo el usuario. | Mientras se confirma, `form.disable()` / `texto.disable()` y `enable()` al volver o al terminar. Como mínimo, en `rechazar()` y `registrar()`, `if (!listoParaEnviar(...)) { confirmando.set(false); return; }`. |
| E-5 | P2 | `factura.ts:213,215,242` | Los validadores no siguen la spec 008: `referencia` es `largoEntre(1, 100)` y la spec pide de 3 a 40. `fecha` solo es requerida, y la spec la pide entre `emitidaEl` y hoy. El monto no se compara con el saldo. Con un monto mayor que el saldo, el resumen de la confirmación dice «El saldo queda en -500,00 BOB» y el usuario confirma un pago que Finanzas rechaza con `PAGO_EXCEDE_SALDO`. | `largoEntre(3, 40)` en referencia. Un validador de fecha (`>= f.emitidaEl.slice(0,10)` y `<= fechaLaPaz()`) con su frase en `mensajeCampo`. Un validador `montoMaximo(saldo)` en centavos, con la frase «El monto supera el saldo (2.800,00 BOB)». Agregar `max` al `<input type="date">`. |
| E-6 | P2 | `unidad.ts:171,272,310` | Los validadores no siguen la spec 010. `fechaProgramada` admite fechas pasadas, y la spec dice «hoy o después». En el cierre se pueden desmarcar ítems y el resumen dice «3 de 5 ítems hechos», pero la spec exige todos con `ok = true`: la confirmación promete algo que el backend rechaza con `400 VALIDACION`, que en pantalla sale como el genérico «Hay datos que no son válidos». | Validador `fechaDesde(fechaLaPaz())` con `min` en el input. Para el cierre, no dejar pedir la confirmación si hay ítems sin marcar: mensaje en línea («Marca todos los ítems; si alguno no se hizo, deja el mantenimiento abierto y anótalo en observaciones»). |
| E-7 | P2 | `ui-comun/src/lib/proveedores.ts:37-42`, `estilos/base.css:99`, `estilos/iconos.css:11` | `iconosListos()` comprueba una sola vez, sin reintento ni plazo. Si `document.fonts.load` resuelve `[]` porque la regla `@font-face` todavía no está registrada, o si la descarga falla una vez, `iconos-listos` no se pone nunca y todos los íconos quedan transparentes toda la sesión. En producción (`optimization` por defecto, CSS crítico en línea), `styles.css` carga de forma asíncrona, y el `@font-face` no es crítico porque `index.html` no tiene íconos. | Quitar el truco de JS y usar `font-display: block` en el `@font-face` generado: el navegador oculta el glifo mientras carga, hasta unos 3 s, sin depender del orden. Si se mantiene el JS, reintentar con `document.fonts.ready` y el evento `loadingdone`, y poner la clase igual pasado un plazo (por ejemplo 3 s). |
| E-8 | P2 | `scripts/iconos.mjs:27,31` | `iconosEn` no ve dos formas reales, probadas con la función exportada: el cierre que Prettier parte en dos líneas (`<mat-icon>x</mat-icon\n>`, que ya se usa en `estado.ts`, `confirmacion.ts` y `seccion.ts`) y el binding `[icono]="'x'"`. Un ícono nuevo escrito así pasa `npm run probar` y sale en blanco. Tampoco hay prueba de que la verificación falla con un ícono fuera de la lista. Además, `ENLACES` (`cc-*/seccion.ts`) y `Pendiente.icono` (`tablero/domain/tablero.ts:59`) siguen tipados como `string` y no como `Icono`. | Regex de cierre `<\/mat-icon\s*>` y una regla para `\[icono\]="'([a-z0-9_]+)'"`. Tipar con `Icono` los arreglos `ENLACES` y `Pendiente.icono`: así el compilador cubre lo que la regex no ve. Agregar `scripts/iconos.test.mjs` (o un caso en `formulario.spec.ts`) que pase a `iconosEn` cada forma y compruebe que un nombre fuera de `ICONOS` aparece en `faltan`. |
| E-9 | P2 | `cc-tablero/src/app/agente/ui/agente.ts:46` | `{{ m.codigo }}` pone en pantalla el código crudo de la misión (por ejemplo `LLM_NO_DISPONIBLE`), justo lo que la fase quita en el resto. | `mensajeCodigo(m.codigo)` de `ui-comun/dominio`, o una etiqueta corta en `ETIQUETAS` si es un motivo de la misión. |
| E-10 | P2 | `portal-cliente/src/features/servicios/CancelarServicio.tsx:34` | Se crea una clave nueva por cada clic (`conClave(crypto.randomUUID())` dentro de `mutationFn`). Un reintento después de un corte de red sale con otra `Idempotency-Key`, en contra de AGENTS.md y de 000 §4.1. `ConfirmarServicio.tsx` del mismo portal ya lo resuelve bien. | Igual que `ConfirmarServicio`: `useState(() => crypto.randomUUID())`, la clave nueva solo cuando la respuesta es definitiva (`onError` que no sea `TypeError`, y al cerrar el diálogo) y `retry` para `TypeError`. |
| E-11 | P2 | `cc-finanzas/src/app/credito/ui/aprobaciones.ts:83,131` | «Rechazar» un crédito no se deshace (la saga cancela el servicio, spec 012), pero sale con un clic, sin `cc-confirmacion`. DESIGN.md («Acciones que no se deshacen») y el plan («Para ICONIX») no lo listan, aunque cumple el mismo criterio que rechazar entrega o rechazar acción. | Confirmación igual que en `viaje.ts`: «Se rechaza el crédito de {razonSocial} por {monto}: el servicio se cancela. No se puede deshacer.». Agregarlo a la lista de DESIGN.md y de «Para ICONIX». |
| E-12 | P3 | `viaje.ts:262,270` | Validadores que no siguen las specs. La nota de intervención está topada en 300 y la spec 011 admite de 3 a 500 para `MARCAR_RESUELTO`. La nota opcional al aprobar una entrega acepta 1 o 2 caracteres, y la spec 007 pide 3 a 300 si viene. | `exigirTexto(texto, obligatoria ? 3 : 0, opcion === 'MARCAR_RESUELTO' ? 500 : 300, zona)`. Para opcionales con mínimo, `largoEntre` que permita vacío o un largo ≥ 3. |
| E-13 | P3 | `cc-operaciones/src/app/viajes/ui/viaje.ts:52-54` | El esqueleto se dibuja antes de `<cc-encabezado>`: mientras carga, las líneas grises quedan sobre el título y las migas, y el resto de las fichas lo pone debajo. | Mover el `@if (cargandoDe(r))` debajo del encabezado. |
| E-14 | P3 | `cc-operaciones/src/app/acciones/ui/acciones.ts:181` | `pedirRechazo` valida solo `motivo`, pero `listoParaEnviar` enfoca el primer `.ng-invalid` de toda la zona. Si el mensaje también es inválido, el foco va al mensaje y no al motivo que falló. | Pasar como `raiz` el `mat-form-field` del motivo, o enfocar el control por `id`. |
| E-15 | P3 | `cc-operaciones/src/app/servicios/ui/servicios.ts:106-109` | Al abrir la confirmación, el foco va al campo «Motivo», pero el resumen («Se cancela el servicio de… se devuelven… No se puede deshacer») no está asociado al campo, así que el lector de pantalla no lo lee. | `id` en `<p class="resumen">` y `aria-describedby` en el input. |
| E-16 | P3 | `ui-comun/dominio/src/validacion.ts:306-307` vs `reportes.ts:113` | El error dice «Debe ser 0.5 o más» con punto y el hint dice «De 0,5 a 0,95» con coma. | Formatear `min` y `max` con `toLocaleString('es-BO')` en `mensajeCampo`. |
| E-17 | P3 | `DESIGN.md:65` | La documentación dice que el par más bajo de contraste es primary sobre surface-container (5,5). Con los tokens, primary (`#3c6090`) sobre advertencia-container (`#ffdcbd`) da 4,96: es el botón «No, volver» dentro de `cc-confirmacion`. Pasa AA, pero la cifra es falsa. | Corregir el dato en DESIGN.md (4,96, `primary` sobre `advertencia-container`). |
| E-18 | P3 | `DESIGN.md:63` vs `servicios.ts:105` | DESIGN.md dice que cancelar servicio usa `<cc-confirmacion>`, pero usa su propia confirmación en línea; el plan dice «ya confirmaba». | Ajustar el texto de DESIGN.md, o migrar a `cc-confirmacion` con el campo de motivo proyectado. |
| E-19 | P3 | `cc-flota/src/app/unidades/domain/unidad.ts` (`checklistValido`), `cc-finanzas/src/app/facturas/domain/pago.ts` (`saldoDespuesDe`) | Funciones de dominio nuevas sin prueba. Se borraron las pruebas de `pagoValido`, `motivoCancelacionValido` y `puedeRechazar`; sus reemplazos en `formulario.spec.ts` no cubren estas dos. | Un caso por función en la spec de dominio de cada app: 0 líneas, 31 líneas y una línea de 121 caracteres; saldo − monto con un monto mayor que el saldo. |
| E-20 | P3 | `cc-flota/src/app/unidades/ui/unidad.ts:255-263` | El `computed` `mantenimientos` crea `formsCierre` y `cierres` como efecto secundario y fija `tracto` la primera vez que ve el mantenimiento. Si la unidad llega después de la lista, el formulario de cierre queda sin el `required` del kilometraje. | Crear los formularios en un `effect` que dependa de `unidad()` y de la lista, o construirlos al pedir el cierre. |

## Fuera de la Fase E

- `cc-*/src/main.ts:10`: si la configuración no carga, el arranque escribe `e.message` crudo en `<body>`, sin estilos y sin «Reintentar». Es anterior a este commit.
- Los snackbars de error duran 6 s y llevan «Cerrar». Para errores conviene que no desaparezcan solos, o pasarlos a un aviso en línea. Es un criterio de producto, no un defecto de este commit.
- Las cajas `.tabla-ancha` con desplazamiento no son enfocables (`tabindex="0"` con `role="region"` y `aria-label`). Chrome ya las enfoca solo, Safari no. Queda para la auditoría con axe que el plan deja pendiente.
- `PAGO_EXCEDE_SALDO`: la spec 008 pide decir el saldo («El saldo es 1.000,00 BOB»). El mapa da una frase fija. Hace falta leer `extensions` del error, lo que va con E-5.

## Estado vuelta 2

La vuelta 1 no había tocado ningún hallazgo de esta fase: los 20 y los de «Fuera de la Fase E» se hacen aquí.

| id | estado | nota |
|---|---|---|
| E-1 | hecho | Directiva `Campo` (`[formControl], [formControlName]`) que registra el elemento y su control; `listoParaEnviar` pregunta al control, no a la clase `ng-invalid`. Prueba con un componente real (`[formControl]` tras `exigirTexto` y `formControlName`) |
| E-2 | hecho | Ninguna página recarga: sin `[reintentar]`, `refetchObservableQueries` de Apollo; factura, viaje, unidad, acciones, servicios, aprobaciones y el catálogo de reportes pasan el `recargar` de su fachada. El formulario y las claves de `Intentos` siguen vivos |
| E-3 | hecho | «No, volver» y un envío fallido devuelven el foco al botón que pidió la confirmación; tras el éxito, si el botón ya no está, al `h1` (`enfocarTitulo`) |
| E-4 | hecho | El formulario (o el campo) queda deshabilitado mientras se confirma: pago, rechazo de entrega, cierre de mantenimiento, rechazo de acción y de crédito |
| E-5 | hecho | Referencia de 3 a 40, fecha entre `emitidaEl` y hoy (`fechaEntre`, con `min` y `max` en el input) y `montoMaximo` con «El monto supera el saldo (2.800,00 BOB)» |
| E-6 | hecho | Fecha programada desde hoy (`min`); el cierre no pide confirmación con ítems sin marcar y lo dice en línea |
| E-7 | hecho | `font-display: block` en el `@font-face` generado; fuera `iconosListos` y la clase `iconos-listos` |
| E-8 | hecho | Regex con `</mat-icon\s*>` y `[icono]="'x'"`; `scripts/iconos.test.mjs` corre en `npm run iconos` y falla con un ícono fuera de la lista; `ENLACES` y `Pendiente.icono` tipados como `Icono` |
| E-9 | hecho | Grupo `MotivoMision` en `ETIQUETAS` (asistente no disponible, un servicio no respondió, se interrumpió, error interno) |
| E-10 | hecho | Clave por intento ligada al motivo, `retry` para `TypeError` y clave nueva tras una respuesta definitiva o al cerrar el diálogo. Con prueba |
| E-11 | hecho | `cc-confirmacion` para rechazar un crédito; en DESIGN.md y en «Para ICONIX» |
| E-12 | hecho | `largoEntre(min, max, opcional)`: nota opcional vacía o de 3 a 300; marcar resuelto hasta 500 |
| E-13 | hecho | El esqueleto va debajo del encabezado |
| E-14 | hecho | `listoParaEnviar` solo enfoca campos del control que valida (`esParteDe`). Con prueba |
| E-15 | hecho | `aria-describedby` del motivo al resumen |
| E-16 | hecho | `min` y `max` con `toLocaleString('es-BO')` («0,5») |
| E-17 | hecho | DESIGN.md: 4,96, `primary` sobre `advertencia-container` |
| E-18 | hecho | DESIGN.md dice que cancelar servicio usa su confirmación en la fila |
| E-19 | hecho | Pruebas de `checklistValido` (0, 30, 31 líneas; 120 y 121 caracteres) y de `saldoDespuesDe` (incluido el negativo) |
| E-20 | hecho | Los formularios de cierre se crean en un `effect` cuando ya se sabe si la unidad es tracto |
| Fuera: arranque | hecho | `mostrarFalloArranque`: frase sin el mensaje técnico (va a la consola), con estilos propios y «Reintentar» |
| Fuera: snackbars | hecho | Los de error ya no se cierran solos (solo con «Cerrar») |
| Fuera: tablas | hecho | Cada `.tabla-ancha` con `role="region"`, `tabindex="0"` y `aria-label` |
| Fuera: `PAGO_EXCEDE_SALDO` | hecho | El aviso agrega «El saldo es …» con el saldo de la factura y la relee; el validador lo evita antes de enviar. No se leen `extensions` |

Pendientes de la vuelta 1:

| tema | estado | nota |
|---|---|---|
| Búsqueda y orden en Cobranza | hecho | El orden es local y no cambia el total. La búsqueda filtra filas sin tocar los totales y la pantalla lo dice («La fila Total es de todas las cuentas, no solo de las que coinciden»). El orden por columna vale para todo `cc-tabla-reporte` (montos en centavos) |
| Pagos de la factura como tabla | hecho | `mat-table` con fecha, monto, medio, referencia y nota |
| «Leer recibo (OCR)» con teclado | hecho | Un `button` que abre el `input type="file"` oculto; deshabilitado mientras lee o se confirma |
| Cliente fuera del tope en Servicios | hecho | «Cliente fuera de la lista cargada» en vez del UUID. Cotizaciones tiene el mismo patrón y no se tocó |
| Tono del riesgo en el tablero | hecho | `aviso`, con el ícono y el tono de `Riesgo.EN_RIESGO`; DESIGN.md («Tablero») corregido |
| Enums en línea de OpenAPI | hecho | `estado.spec.ts` lee `Alerta.severidad`, `Mision.estado`, `Mision.origen` y `Documento.tipo` de `analitica.yaml` y `flota.yaml` |

Conteo: hecho 30 · pendiente backend 0 · descartado 0.

Queda sin hacer, sin ser hallazgo: `PAGO_DUPLICADO` no muestra el pago existente (spec 008) y no se comprobó nada en el navegador (sin backend en local).
