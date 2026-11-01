# Revisión web, vuelta 4 (commit 89b894f)

Alcance: el commit `89b894f`, que corrige `web-vuelta-2.md` («Estado vuelta 4»), contrastado con la spec 008, la 012, la 014 y el contrato GraphQL. Además, el flujo de confirmación en factura, aprobaciones, acciones, entrega observada, mantenimiento y servicios. Solo frontend. No repito lo que ya está en `web-vuelta-3.md`. Las líneas son las de `89b894f`.

En una copia descartable del árbol en `89b894f` (ya borrada) pasaron `npm run probar` (ui-comun 105, cc-operaciones 21, cc-finanzas 15, cc-tablero 30, cc-flota 12) y `ng build` de cc-finanzas, cc-operaciones y cc-tablero. V4-1 se comprobó en esa copia con una prueba sobre Apollo 4.3.5 real; la prueba no quedó en el repo. Nada se probó en un navegador.

Conteo: P0 0 · P1 0 · P2 1 · P3 4.

## Hallazgos

| id | sev | archivo:línea | problema | arreglo concreto |
|---|---|---|---|---|
| V4-1 | P2 | `cc-finanzas/.../facturas/ui/factura.ts:361-365`, `:372-374`, `:344-346`; `facturas/facturas.fachada.ts:52-55`; `facturas/data/facturas.repositorio.ts:19-21` | V2-5 sigue abierto. `recargar()` hace un `fetch` aparte (`network-only`). Cuando resuelve, el `watch` que alimenta `factura()` **todavía no emitió**: emite en una tarea posterior. Se comprobó con Apollo 4.3.5: justo después de `await`, el `watch` sigue en `10.00` aunque la red ya devolvió `5.00`, y lo mismo pasa con `firstValueFrom` y varias microtareas. `Factura` no tiene `id` ni `keyFields`, así que la respuesta de la mutación tampoco actualiza la caché. Resultado: (a) con `PAGO_EXCEDE_SALDO`, el aviso dice el saldo **viejo** (el Gateway no reenvía la extensión `saldo`) y `updateValueAndValidity()` valida contra ese mismo saldo, así que el monto no queda marcado. (b) Con `PAGO_DUPLICADO` contra un pago que registró otra persona, `pagoRepetido` busca en la lista vieja, no lo encuentra y sale el texto genérico sin marcar la fila. (c) Si el pago deja el saldo en 0, `puedeRegistrar()` sigue en `true`, no se llama a `enfocarTitulo()`, y el botón «Registrar pago», que tenía el foco desde `cerrar()`, desaparece un momento después: el foco se pierde. La prueba nueva de `apollo.spec.ts` no lo detecta porque espera con `setTimeout` antes de mirar. | Guardar el `QueryRef` de `observarFactura` y hacer que `recargar()` llame a `queryRef.refetch()`: con `refetch` del mismo `ObservableQuery`, el `watch` ya tiene el saldo nuevo cuando resuelve la promesa (comprobado). Otra opción: usar los datos que devuelve el `fetch` en vez de `this.factura()`. En `apollo.spec.ts`, comprobar el valor **sin** `setTimeout` después de `await`. |
| V4-2 | P3 | `cc-finanzas/.../facturas/ui/factura.ts:176`, `:347-349` | Después de un fallo, `volver()` desbloquea el formulario **antes** de la relectura de `explicarFallo`, y «Guardar el pago» no tiene `[disabled]="enviando()"`. Mientras se relee la factura, el usuario puede cambiar el monto y volver a guardar. `revisar()` bloquea el formulario y abre la confirmación; después, el `updateValueAndValidity()` de la línea 363 corre sobre un control deshabilitado y no valida nada. La confirmación muestra un monto que no se revisó contra el saldo nuevo. Finanzas lo vuelve a rechazar, así que no se pierde ni se duplica dinero, pero es la carrera que preguntaba la vuelta. | `[disabled]="enviando()"` en «Guardar el pago». Mejor aún: llamar a `volver()` después de `explicarFallo`, no antes. |
| V4-3 | P3 | `cc-tablero/.../reportes/reportes.fachada.ts:41-46`, `:58-60`; `ui/reportes.ts:50-57` | V2-9 quedó a medias en reportes. `recargarCatalogo()` es síncrono (`void`), así que `reintentando` pasa a `true` y vuelve a `false` en el mismo tick: el botón nunca se deshabilita y «Reintentando…» nunca se anuncia. Además, `startWith(undefined)` borra `errorCatalogo`. El aviso y su botón salen del DOM con el foco encima, y si vuelve a fallar reaparecen, pero el foco del teclado ya quedó en `body`. | Que `recargarCatalogo()` devuelva una promesa que resuelva con la próxima respuesta (por ejemplo, `firstValueFrom` de un `Subject` de respuestas). Mientras recarga, mantener el error anterior: en vez de `startWith(undefined)`, una señal `recargando` que muestre el esqueleto sin quitar el aviso. |
| V4-4 | P3 | `ui-comun/src/lib/aviso-servicios.ts:38-47`, `:81-91` | Si el reintento vuelve a fallar con el mismo error, el lector de pantalla no se entera. La región viva pasa de «Reintentando…» a vacía, y el `<p role="alert">` (`track a`) tiene el mismo texto, así que no se vuelve a crear ni a anunciar. Con lector de pantalla parece que funcionó. | Al terminar, si `avisos().length` sigue en más de 0, dejar en la región viva «Sigue sin responder: {{ avisos()[0] }}» (una señal `resultado` en lugar del texto fijo) y limpiarla con el próximo intento. |
| V4-5 | P3 | `cc-finanzas/.../cobranza/ui/cobranza.ts:30-35` | El `<p class="secundario" role="status">`, que ahora siempre está, queda vacío cuando no se busca. Igual conserva el margen por defecto del `<p>` (`.secundario` no lo quita, `base.css:48`), así que entre la búsqueda y la tabla hay un hueco de alrededor de 1 em que antes no estaba. | `.secundario:empty { margin: 0 }` en el componente, o un `<div role="status">` sin margen con el texto en un `<p>` dentro del `@if`. |

## Mal cerrados de la vuelta 2

| id | estado declarado | qué falta | ver |
|---|---|---|---|
| V2-5 | hecho | La relectura se espera, pero `factura()` todavía no cambió cuando termina: el aviso y la validación usan el saldo viejo. El mismo problema afecta a `PAGO_DUPLICADO` y al foco después de un pago total. | V4-1, V4-2 |
| V2-9 | hecho | En las páginas con `recargar` que devuelve una promesa, funciona. En reportes no se ve ni se anuncia, y el foco se pierde. En ninguna página se anuncia que el reintento volvió a fallar. | V4-3, V4-4 |
| «Sin comprobar: `recargar` tras un fallo sin datos» | hecho | Es cierto que el `watch` termina limpiando el error, pero **después** de que resuelve `recargar`. La prueba lo esconde con un `setTimeout`. | V4-1 |

Verificados y bien cerrados:

- **V2-1:** `type="button"` en los dos botones de `cc-confirmacion`, con prueba en un `form` real. Se revisaron los cinco `<form>` (factura, programar mantenimiento, parámetros de reportes y voz): solo envían «Guardar el pago», «Programar», «Ver» y «Preguntar». «Exportar» y «Cancelar» son `type="button"`, y los botones de voz que no son de envío están fuera del `form`.
- **V2-2 y V2-3 (`ConfirmacionUnica`):** abrir otra confirmación desbloquea la anterior, y `cerrar(id)` con otro id no toca la abierta. Aprobar B mientras A confirma no cierra A. Un rechazo fallido de A llama a `volver(A)` solo si A sigue abierta. El foco queda bien: al abrir B, `Confirmacion` lo lleva al resumen de B con `afterNextRender`. Al volver o fallar, `enfocar('rechazar-…')` corre en un `setTimeout`, cuando `enviando` ya está en `false` y el botón existe habilitado. No guarda estado global: los controles son de la página y se van con ella, así que no hay nada que limpiar al destruirla. Si la solicitud abierta se decide por otro lado y desaparece, la próxima `abrir` libera su control sin problema.
- **V2-4:** «Aprobar y enviar» se oculta con `rechazando() !== a.accionId`.
- **V2-6:** la nota coincide con la spec 008 (tabla de reglas: opcional, hasta 300), con `PagoInput.nota` (`centro-control.graphql:679`), con `maxLength: 300` de `finanzas.yaml:526-528` y con `varchar(300)` en la base. Se envía con `trim() || undefined`, `completarConRecibo` la conserva para `setValue` y `reset` la vacía. El Gateway la pasa en `...resto`.
- **V2-7:** el rechazo de crédito lee `getRawValue()` con el motivo bloqueado. En acciones, lo mismo. Cancelar servicio (V2-13) bloquea y desbloquea en `finally`.
- **V2-8:** `LIMITE` es justo el código con que Analítica cierra `AGOTADA` (`agente.py:269`). El comentario de `MotivoMision` todavía dice «SALTADA o FALLIDA».
- **V2-10 y V2-11:** la región de cobranza está siempre y el `@if (visibles(); as r)` no recrea el bloque al teclear. `cc-tabla-reporte` lleva `role="region"`, `tabindex="0"` y `aria-label`.
- **Usabilidad de la confirmación:** factura, crédito, acciones, entrega observada y mantenimiento siguen el mismo patrón (validar, bloquear, resumen con «No se puede deshacer», «Sí, …» y «No, volver», el foco vuelve al botón que la abrió y, si sale bien, va al título). La acción contraria se oculta mientras se confirma. No quedan estados atascados. Cancelar servicio es la excepción a propósito: el motivo se escribe dentro de la confirmación de la fila.

## Para mirar en el navegador

- Cuando un botón con el foco pasa a `disabled` (el de «Reintentar» de `cc-aviso-servicios`, el de «Sí, cancelar el servicio»), la regla de *focus fixup* del HTML lleva el foco a `body`. Si pasa así: en «Reintentar», cuando el reintento falla, el foco no vuelve. En cancelar servicio, el `catch` (`servicios.ts:252-253`) no llama a `enfocar`, a diferencia de las otras confirmaciones. Arreglo posible: `disabledInteractive` en esos `mat-button` y `enfocar('motivo-' + servicioId)` en el `catch`.

## Veredicto

La vuelta cierra bien lo que bloqueaba la demostración: «No, volver» en la factura, los bloqueos por ítem en crédito y acciones, la nota y `LIMITE`. Ya no queda ninguna confirmación que se trabe. Antes de mostrar el cobro, hay que arreglar **V4-1**: hoy, cuando otro pago bajó el saldo, el aviso de `PAGO_EXCEDE_SALDO` da un saldo equivocado. Es un número de dinero en pantalla y el arreglo cabe en la fachada (`refetch` del `watch`). El resto (V4-2 a V4-5) son P3 de foco, anuncio y espaciado.

## Estado vuelta 6

Conteo: hecho 10 · pendiente backend 0 · descartado 0.

| id | estado | qué se hizo |
|---|---|---|
| V4-1 | hecho | Los repositorios devuelven el `QueryRef` del `watch` y `recargar()` hace `refetch()` sobre él en las seis fachadas que lo tenían (factura, crédito, acciones, servicios, viaje, unidad). Al terminar el `await`, la señal ya trae el saldo y los pagos nuevos: el aviso de `PAGO_EXCEDE_SALDO` dice el saldo actual y marca el monto, `PAGO_DUPLICADO` encuentra el pago de otra persona y, con saldo 0, el foco va al título. `apollo.spec.ts` mira justo después del `await`, sin `setTimeout`; con un `client.query` aparte, sus dos pruebas fallan (comprobado). `viajes.fachada.spec.ts` comprueba que `recargar` usa el `refetch` del mismo `watch`. |
| V4-2 | hecho | Mientras se relee la factura, «Guardar el pago» queda `aria-disabled` (sigue enfocable, `revisar()` no hace nada) y una región `status` dice «Comprobando el saldo actual de la factura; espera un momento para volver a guardar.». Si la relectura deja el saldo en 0, el foco va al título. |
| V4-3 | hecho | `recargarCatalogo()` devuelve una promesa que resuelve con la próxima respuesta. Mientras recarga, el esqueleto se muestra sin quitar el aviso anterior, así «Reintentando…» se ve y se anuncia. Si el reintento funciona y el aviso desaparece, `cc-aviso-servicios` lleva el foco al título de la página (en todas las páginas, no solo en reportes). |
| V4-4 | hecho | La región viva de `cc-aviso-servicios` pasa de «Reintentando…» a «Sigue sin responder: {aviso}» si vuelve a fallar, y se limpia con el próximo intento. |
| V4-5 | hecho | La región `status` de cobranza no tiene margen mientras está vacía (`[class.sin-margen]`). |
| V2-5 | hecho | Cerrado con V4-1 y V4-2. |
| V2-9 | hecho | Cerrado con V4-3 y V4-4. |
| «Sin comprobar: `recargar` tras un fallo sin datos» | hecho | La prueba nueva lo comprueba justo después del `await`. |
| Foco con un botón que pasa a `disabled` | hecho | «Reintentar», los dos botones de `cc-confirmacion`, «Sí, cancelar el servicio» y «No, volver» de servicios, y los botones que envían directo (aprobar acción, aprobar crédito, aprobar entrega, resolver intervención, programar mantenimiento, disparar misión) usan `disabledInteractive`: quedan `aria-disabled` y enfocables, y el manejador ignora el clic mientras envía. Si cancelar servicio falla, el foco vuelve al motivo. |
| Comentario de `MotivoMision` (V2-8) | hecho | El comentario ya dice SALTADA, FALLIDA o AGOTADA. |

Verificado: en `centro-control`, `generar:verificar`, `formato`, `capas`, `complejidad`, `probar` (ui-comun 110, cc-operaciones 23, cc-finanzas 16, cc-tablero 31, cc-flota 12) y `construir`; en `portal-cliente`, `verificar` (51 pruebas). Nada se probó en un navegador.
