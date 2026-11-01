# Revisión web, vuelta 2 (commit b88543b)

Alcance: el commit `b88543b` («corrige los hallazgos de la segunda vuelta»), contrastado con `specs/revisiones/web-fase-e.md` («Estado vuelta 2»), la spec 008 y el contrato GraphQL. Solo frontend. Revisión de código; nada se probó en el navegador (sin backend). Dos hallazgos (V2-1 y V2-2) se reprodujeron con una prueba en una copia descartable del árbol; la copia ya se borró y la prueba no quedó en el repo. En esa copia, `npm run iconos`, `ng test ui-comun` (97 pruebas) y `ng test cc-finanzas` (10) pasan.

## Hallazgos

| id | sev | archivo:línea | problema | arreglo concreto |
|---|---|---|---|---|
| V2-1 | P1 | `ui-comun/src/lib/confirmacion.ts:19,23` + `cc-finanzas/.../facturas/ui/factura.ts:131-173` | Los dos botones de `cc-confirmacion` no tienen `type`, así que dentro de un `<form>` son `submit`. En la factura la confirmación está dentro de `<form (ngSubmit)="revisar(...)">`. Al pulsar «No, volver», `volver()` desbloquea el formulario y, como la app no usa zone.js, el botón sigue en el DOM cuando el navegador hace el envío. `revisar()` ve el formulario válido, lo vuelve a bloquear y reabre la confirmación: «No, volver» no hace nada. Se reprodujo con una prueba: `ngSubmit` se dispara una vez al pulsar «No, volver». «Sí, registrar» también envía el formulario; no hace daño porque está deshabilitado. | Poner `type="button"` en los dos botones de `Confirmacion`. Agregar una prueba con `cc-confirmacion` dentro de un `form` que compruebe que «No, volver» no emite `ngSubmit`. |
| V2-2 | P1 | `cc-finanzas/.../credito/ui/aprobaciones.ts:164-169` | `rechazando` guarda una sola solicitud. Si se pide rechazar B mientras A está confirmando, la confirmación de A se cierra pero su motivo queda `disable()` para siempre. Después, «Rechazar» en A no hace nada y no avisa: un control deshabilitado nunca es `valid`, así que `exigirTexto` devuelve `false` y no hay campo que enfocar (se comprobó con una prueba). Solo se recupera recargando la página. | En `pedirRechazo`, si `rechazando()` es otra solicitud, primero habilitar su motivo (`this.motivoDe(previa).enable()`). Otra opción: deshabilitar «Rechazar» en las demás tarjetas mientras haya una confirmación abierta. |
| V2-3 | P1 | `cc-operaciones/.../acciones/ui/acciones.ts:191-195` | El mismo caso que V2-2, pero se bloquea todo el `FormGroup` (mensaje y motivo). En la acción A quedan muertos «Rechazar» y también «Aprobar y enviar» (`listoParaEnviar` sobre un control deshabilitado devuelve `false`), y nada lo explica. | Igual que V2-2: al cambiar de acción, habilitar el formulario de la anterior (`this.forms[previa]?.enable()`), o deshabilitar los botones de las demás mientras se confirma. |
| V2-4 | P2 | `cc-operaciones/.../acciones/ui/acciones.ts:94-96` | Mientras se confirma el rechazo, «Aprobar y enviar» sigue visible y activo, pero el formulario está deshabilitado: el clic no hace nada y no avisa. Aprobación de crédito y entrega observada sí ocultan la acción contraria durante la confirmación. | Envolver «Aprobar y enviar» en `@if (rechazando() !== a.accionId)`, igual que «Rechazar». |
| V2-5 | P2 | `cc-finanzas/.../facturas/ui/factura.ts:326-329` | Con `PAGO_EXCEDE_SALDO`, el aviso dice «El saldo es …» con `this.factura()!.saldo` **antes** de releer la factura. `montoMaximo` ya bloquea los montos mayores que el saldo en pantalla, así que este error solo llega cuando el saldo real es menor (otro pago). En ese caso el número que se muestra es el viejo, que es justo el que está mal. | Hacer primero `await this.fachada.recargar()` y después armar el mensaje con el saldo nuevo (y volver a validar `monto` para que `montoMaximo` marque el campo). |
| V2-6 | P2 | `cc-finanzas/.../facturas/ui/factura.ts:131-157`, `domain/pago.ts:5-10` | La spec 008 (tabla de reglas) y `PagoInput.nota` (`centro-control.graphql:679`) aceptan una nota opcional de hasta 300 caracteres, pero el formulario no tiene ese campo. La tabla de pagos nueva muestra la columna «Nota», que siempre queda vacía para los pagos cargados desde aquí. | Agregar `nota` al formulario y a `PagoEnEdicion` con `largoEntre(0, 300)` (opcional) y enviarla con `trim() \|\| undefined`. Si no se quiere, quitar la columna. |
| V2-7 | P3 | `cc-finanzas/.../credito/ui/aprobaciones.ts:181` | `decidir()` hace `control.enable()` antes de enviar el rechazo confirmado, así que el motivo se puede editar mientras se envía. Lo editado no cambia lo que se manda y E-4 queda a medias. | Habilitar solo para aprobar: `if (aprobado) control.enable()`. En el rechazo, leer `getRawValue()` sin desbloquear y habilitar en `volver()` o tras el éxito. |
| V2-8 | P3 | `ui-comun/dominio/src/etiquetas.ts:115-121` | Falta un valor en `MotivoMision`: Analítica cierra la misión `AGOTADA` con `codigo = "LIMITE"` (`servicios/analitica/app/aplicacion/agente.py:269`). En el agente sale el texto genérico de `legible('LIMITE')`, con el ícono `help`. | Agregar `LIMITE: e('Llegó al límite de pasos', 'timer_off', 'aviso')` (el ícono ya está en la lista). |
| V2-9 | P3 | `ui-comun/src/lib/aviso-servicios.ts:40,72-76`; `cc-tablero/.../reportes/reportes.fachada.ts:44-46` | «Reintentar» no da ninguna señal mientras se reintenta: el botón no se deshabilita y no aparece un indicador. Si vuelve a fallar, el aviso queda igual que antes y parece que el botón no hizo nada. En reportes, `cargandoCatalogo` (`respuesta() === undefined`) no vuelve a `true` al reintentar. | En `AvisoServicios`, una señal `reintentando` que esté en `true` mientras dure la promesa: botón `[disabled]` y texto «Reintentando…» con `aria-live="polite"`. |
| V2-10 | P3 | `cc-finanzas/.../cobranza/ui/cobranza.ts:29-34` | El `role="status"` («N cuentas coinciden…») se crea junto con su texto dentro del `@if (buscando())`. Los lectores de pantalla suelen no anunciar una región viva que aparece ya con contenido, así que la primera búsqueda no se anuncia. | Dejar el `<p role="status">` siempre presente y poner el texto adentro solo mientras se busca. |
| V2-11 | P3 | `ui-comun/src/lib/tabla-reporte.ts:57` | La tabla de `cc-tabla-reporte` (cobranza, reportes, voz) tiene `overflow-x: auto` pero no `role="region"`, `tabindex="0"` ni `aria-label`, al revés que las `.tabla-ancha` del commit. En Safari y Firefox no se puede desplazar con el teclado. | Usar la misma envoltura: `role="region" tabindex="0" [attr.aria-label]="r.titulo"`. |
| V2-12 | P3 | las 18 `.tabla-ancha` (por ejemplo `cc-finanzas/.../facturas/ui/facturas.ts:56`) | `tabindex="0"` va siempre, aunque la tabla no se desborde (lo normal en escritorio): una parada de tabulación extra por página antes de los enlaces de las filas. Molestia menor; el foco se ve (`:focus-visible` en `base.css:99`). | Aceptable como está. Para afinarlo: una directiva que ponga `tabindex` solo cuando `scrollWidth > clientWidth` (con `ResizeObserver`). |
| V2-13 | P3 | `cc-operaciones/.../servicios/ui/servicios.ts:113-127` | Cancelar servicio (confirmación en la fila) no bloquea el motivo mientras se envía, al revés que las otras confirmaciones de E-4. | `this.motivo.disable()` antes de enviar y `enable()` en el `finally`. |

## Hallazgos de E mal cerrados

| hallazgo de E | estado real | ver |
|---|---|---|
| E-3 / E-4 (pago) | En la factura, «No, volver» no vuelve: el envío implícito del `form` reabre la confirmación. | V2-1 |
| E-4 (crédito y acciones) | El bloqueo puede quedar puesto para siempre si se abre otra confirmación, y en crédito se desbloquea durante el envío. | V2-2, V2-3, V2-7 |
| Fuera de E: `PAGO_EXCEDE_SALDO` | El saldo del aviso es el de antes de releer la factura. | V2-5 |
| E-9 (`MotivoMision`) | Falta `LIMITE`, el código de las misiones `AGOTADA`. | V2-8 |

## Comprobado y correcto

- **E-1:** `Campo` se importa en los nueve componentes con formularios y `primerInvalido` le pregunta al control.
- **E-14:** `esParteDe` funciona.
- **E-5:** la fecha va entre la emisión y hoy, con `min` y `max`; la referencia, de 3 a 40, y el monto no pasa del saldo.
- **E-6:** la fecha programada empieza en hoy y el aviso del checklist sale en línea.
- **E-20:** los formularios de cierre se crean en un `effect`. Como hay un solo `EN_CURSO` por unidad (spec 010), el caso de V2-2 no aplica a mantenimiento.
- **E-7:** el CSS generado tiene `font-display: block` y ya no está `iconos-listos`.
- **E-8:** la regex cubre `</mat-icon\s*>` y `[icono]`, y `iconos.test.mjs` corre en `npm run iconos`.
- **E-10:** clave estable por motivo y `retry` para `TypeError`.
- **E-11, E-12, E-15, E-16:** hechos.
- **Pagos como tabla:** hecho.
- **OCR con teclado:** es un `button` deshabilitado mientras lee o confirma.
- **Prueba de enums en línea:** hecha.
- **Cobranza:** el total no cambia con la búsqueda ni con el orden, y la pantalla lo dice.
- **Regresiones de la vuelta:**
  - `refetchObservableQueries` (Apollo 4.3.5) solo vuelve a pedir las consultas `watch` activas: no repite mutaciones ni suscripciones. Las páginas sin `[reintentar]` usan `watch`, así que el reintento por defecto sí les llega.
  - `MatSnackBar` muestra un aviso a la vez, así que los de error que ya no se cierran solos no se acumulan: el siguiente los reemplaza.
  - En el portal, `CancelarServicio` toma un 5xx como respuesta definitiva y genera otra clave. Sigue el patrón de `ConfirmarServicio` y cancelar es idempotente por estado, así que no se anotó.

Sin comprobar: si un `fetch` de la fachada (`recargar`) limpia el `error` de un `watch` que había fallado sin datos. Depende de Apollo en ejecución y conviene mirarlo en el navegador.

## Estado vuelta 4

La vuelta 3 (`65e8517`) no cerró ninguno de estos hallazgos; todos se trabajaron aquí.

| id | estado | nota |
|---|---|---|
| V2-1 | hecho | `type="button"` en los dos botones de `cc-confirmacion`. Se revisaron los `<form>` de las 4 apps: el único submit es el de enviar. Prueba con un `form` real: falla sin el arreglo («No, volver» emitía `ngSubmit`). |
| V2-2 | hecho | `ConfirmacionUnica` (ui-comun): una confirmación a la vez; abrir la de otra solicitud desbloquea la anterior. Pruebas con dos ítems. |
| V2-3 | hecho | Acciones usa `ConfirmacionUnica`; aprobar B ya no cierra la confirmación de A dejándola bloqueada. |
| V2-4 | hecho | «Aprobar y enviar» se oculta mientras esa acción confirma el rechazo. |
| V2-5 | hecho | Con `PAGO_EXCEDE_SALDO` se relee la factura antes del aviso y el monto se vuelve a validar contra el saldo nuevo. |
| V2-6 | hecho | Campo «Nota (opcional)», 0 a 300 caracteres, se envía con `trim() \|\| undefined`. `PagoInput.nota` ya existía y la operación usa `PagoInput`: no hubo que regenerar. |
| V2-7 | hecho | El rechazo de crédito se envía con el motivo bloqueado; solo aprobar valida y usa el campo habilitado. |
| V2-8 / E-9 | hecho | `MotivoMision.LIMITE`. Es el único código de Analítica que faltaba (también usa `LLM_NO_DISPONIBLE`, `DEPENDENCIA_NO_DISPONIBLE`, `ERROR_INTERNO` e `INTERRUMPIDA`, que ya estaban). |
| V2-9 | hecho | `AvisoServicios.reintentando`: botón deshabilitado y «Reintentando…» en una región `aria-live`. En reportes, el catálogo vuelve a «cargando» al reintentar. |
| V2-10 | hecho | El `role="status"` de cobranza está siempre; solo cambia su texto. |
| V2-11 | hecho | La tabla de `cc-tabla-reporte` lleva `role="region"`, `tabindex="0"` y `aria-label`. |
| V2-12 | descartado | La propia revisión lo da por aceptable; una directiva con `ResizeObserver` no compensa una parada de tabulación. |
| V2-13 | hecho | Cancelar servicio bloquea el motivo mientras se envía. |
| Sin comprobar: `recargar` tras un fallo sin datos | hecho | Comprobado con una prueba sobre Apollo 4.3.5 real (`apollo.spec.ts`): la consulta `network-only` de `recargar` escribe la caché y el `watch` emite los datos con `error` en `undefined`. |

Pendiente backend: ninguno.
