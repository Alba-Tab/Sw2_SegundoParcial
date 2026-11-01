# Revisión web, vuelta 3 (commit 65e8517)

Alcance: el commit `65e8517`, que corrige `web-vuelta-1.md` («Estado vuelta 3»), y una revisión final de punta a punta de cada rol: gerente, despachador, jefe_flota, administración y comercial en el Centro de Control, y cliente y comercial en el portal. Solo frontend. Las líneas son las de `65e8517`. No repito lo que ya está en `web-vuelta-2.md` (confirmaciones dentro del `form`, bloqueo por ítem, nota del pago, `LIMITE`, «Reintentar» sin señal, `role="status"` de cobranza, `tabla-reporte` sin región).

En una copia descartable del árbol en `65e8517` (ya borrada) pasaron `npm run probar` del Centro de Control (iconos, ui-comun 100, cc-operaciones 21, cc-finanzas 15, cc-tablero 30, cc-flota 12) y `vitest run` del portal (47). Nada se probó en un navegador.

Conteo: P0 0 · P1 1 · P2 1 · P3 13.

## Hallazgos

| id | sev | archivo:línea | problema | arreglo concreto |
|---|---|---|---|---|
| V3-1 | P1 | `portal-cliente/src/features/servicios/PaginaServicios.tsx:84-89`, `features/facturas/PaginaFacturas.tsx:156-172` | En el portal, la única forma de abrir un servicio es hacer clic en la fila (`TableRow onClick`). La fila no recibe foco, no es un enlace y no responde al teclado. Con teclado o lector de pantalla, el cliente y el comercial **no pueden abrir el detalle de un servicio** (ni cancelarlo, ni ver la entrega). En Facturas pasa lo mismo, y además la fila lleva al servicio sin decirlo. Rompe WCAG 2.1.1. | Volver enlace la primera celda: en Servicios, la fecha o la ruta dentro de `<Link component={RouterLink} to="/servicios/$servicioId">`; en Facturas, el número, con el texto «Ver servicio» si lleva al servicio. El `onClick` de la fila puede quedar como atajo del mouse. Agregar una prueba que encuentre el enlace por `getByRole('link')`. |
| V3-2 | P2 | `portal-cliente/src/features/servicios/PaginaServicio.tsx:105` | El detalle del servicio dice «Factura FAC-000123» como texto plano. `facturaId` llega en el mismo `Servicio` (`viajes.zod.ts:575`) y la ruta `/facturas/$facturaId` ya resalta y enfoca esa fila (N6). El cliente tiene que ir a Facturas y buscarla a mano. Es un callejón: desde la factura sí se llega al servicio, pero no al revés. | `{s.facturaId && s.numeroFactura && <Link component={RouterLink} to="/facturas/$facturaId" params={{ facturaId: s.facturaId }}>Factura {s.numeroFactura}</Link>}`. |
| V3-3 | P3 | `cc-tablero/src/app/tablero/ui/tablero.ts:115` | Queda un «—» en el tablero: «Cuentas por cobrar», cuando `cuentasPorCobrar` viene nulo. Contradice la regla nueva «Valor vacío» de DESIGN.md. | `Sin dato`, igual que los otros dos bloques del tablero (`:75`, `:93`). |
| V3-4 | P3 | `cc-flota/src/app/conduccion/ui/conduccion.ts:19` | `PuntajesConduccion.datosAl` es nullable en el contrato (`centro-control.graphql:316`). Con el pipe nuevo, la línea dice «… · datos al Sin dato». DESIGN.md dice ahora que «Datos al …» no se muestra sin fecha. | `@if (p.datosAl) { · datos al {{ p.datosAl \| fecha: true }} }`. |
| V3-5 | P3 | `cc-operaciones/src/app/viajes/ui/mapa.ts:25` | El popup del mapa dice «Riesgo Sin dato» (antes «Riesgo —»). Lo ve en todos los viajes el comercial, que no tiene `verRiesgo` (`@include(if: $verRiesgo)`), y también cualquiera cuando aún no hay predicción. Para el comercial, el campo ni siquiera existe. | Agregar la línea solo si `v.riesgo` existe: `...(v.riesgo ? [salto(), \`Riesgo de retraso ${pct(v.riesgo.probabilidad)}\`] : [])`. |
| V3-6 | P3 | `cc-operaciones/src/app/viajes/ui/mapa.ts:39-41`, `:100` | Si Viajes no responde, `viajes()` llega vacío, `cargando()` es `false` y sale «Ese viaje aún no reporta posición» junto al banner «Viajes no disponible». La primera frase es falsa: no se sabe nada del viaje. Además, el `<p role="status">` nace con su texto, el mismo caso de V2-10: no se anuncia. | `&& !this.fachada.error()` en la condición. Dejar el `<p role="status">` siempre en el DOM y poner solo el texto dentro del `@if`. |
| V3-7 | P3 | `cc-finanzas/src/app/lineas/ui/lineas.ts:28-33` | Regresión de V1-11. Sin el banner, cuando faltan líneas solo queda el aviso «No se pudo leer la línea de N clientes», que **no tiene «Reintentar»**. Para volver a pedir hay que recargar la página. DESIGN.md: «si falla una fuente … ofrece «Reintentar»». | Agregar en el aviso un botón «Reintentar» que llame a `recargar` de la fachada (el mismo patrón que `cc-aviso-servicios`), o pasarle a `cc-aviso-servicios` una entrada `[extra]` con ese texto. |
| V3-8 | P3 | `portal-cliente/src/features/servicios/PaginaServicio.tsx:78-80` | V1-15 cambió el chip de `REQUIERE_INTERVENCION` a «La empresa está resolviendo un imprevisto», en `primary` (espera). Debajo sigue un `Alert severity="warning"` que dice lo mismo con otras palabras («Hubo un problema al confirmar…»). Es el mismo hecho dicho dos veces y con dos tonos, contra la regla del reloj de arena que acaba de entrar en DESIGN.md. | `severity="info"` y un texto que agregue algo: «Te avisaremos por correo cuando se resuelva. No tienes que hacer nada.». |
| V3-9 | P3 | `portal-cliente/src/compartido/ui/AvisoComercial.tsx:27-35` | V1-14 promete la banda «en una línea» a 375 px, pero solo oculta la nota. Quedan el ícono del `Alert`, «Atendiendo a: <razón social>» y el botón «Cambiar cliente» (44 px de alto). Con una razón social normal («Agroexport Santa Cruz S.R.L.»), el texto queda en unos 170 px y se parte en dos o tres líneas fijas. | En `xs`: `icon={false}` y el nombre con `noWrap` (`<Box component="strong" sx={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>`), con el nombre completo en `title`. Comprobarlo a 375 px. |
| V3-10 | P3 | `portal-cliente/src/compartido/ui/EstadoServicio.tsx:43` | «La empresa está resolviendo un imprevisto» (41 caracteres) va en un `Chip size="small"`. MUI corta la etiqueta con elipsis (`white-space: nowrap`, `max-width: 100%`). En el encabezado del detalle (fila con la ruta en `h2`), a 375 px se puede leer «La empresa está resolvi…». Hay que confirmarlo en el navegador. | Un texto corto para el chip, «Resolviendo un imprevisto», y la frase larga en el `Alert` de V3-8. |
| V3-11 | P3 | `cc-finanzas/src/app/facturas/ui/factura.ts:301`, `:360` | `etiqueta('MedioPago', …).texto.toLowerCase()` arma «por efectivo» en el resumen de la confirmación y en el aviso de PAGO_DUPLICADO. Lo correcto es «en efectivo». | Un mapa de preposición por medio: `{ EFECTIVO: 'en efectivo', TRANSFERENCIA: 'por transferencia', DEPOSITO: 'por depósito', CHEQUE: 'con cheque' }` en `domain/pago.ts`, con prueba. |
| V3-12 | P3 | `cc-finanzas/src/app/facturas/ui/factura.ts:204` | El pago repetido se marca en la tabla solo con el fondo (`.repetido`). El aviso dice «Está marcado en Pagos», pero con lector de pantalla, o si el aviso ya se cerró, la fila no dice nada. | Agregar en la celda de la referencia `<span class="cdk-visually-hidden"> (ya registrado)</span>` cuando `p.pagoId === repetido()`, o un ícono con su texto. |
| V3-13 | P3 | `cc-operaciones/src/app/acciones/ui/acciones.ts:71` | Si la acción no tiene placa, el enlace al viaje dice «sin unidad»: el texto describe una falta, no adónde lleva. La lista de Viajes usa «Sin unidad» con mayúscula. | El enlace dice «Ver viaje» y la placa (o «sin unidad») va fuera del enlace. |
| V3-14 | P3 | `cc-operaciones/src/app/viajes/ui/intervenciones.ts:28`, `viajes/ui/viaje.ts:125` | Usan jerga de la saga en pantalla: «Viajes cuya compensación se agotó» y el botón «Reintentar la compensación». PRODUCT.md pide «sin jerga técnica». El despachador no sabe qué es «compensación». | Subtítulo: «La cancelación automática no terminó (reserva o crédito sin liberar): reintenta o márcalo resuelto en el viaje». Botón: «Reintentar la liberación». El valor `REINTENTAR_COMPENSACION` no cambia. |
| V3-15 | P3 | `portal-cliente/index.html:8`; `features/comercial/PaginaClientes.tsx:49-58`; `features/facturas/Credito.tsx:19`, `:31`; `features/facturas/PaginaFacturas.tsx:67` | Detalles del portal, cada uno pequeño: (a) la pestaña del navegador dice siempre «Portal del cliente · Transporte de carga», nunca la página. (b) Si la búsqueda de clientes no encuentra nada, la lista queda vacía sin texto. (c) `Credito` devuelve `null` mientras carga, sin `Cargando`, y la página salta. (d) Los chips «En mora» y «N días vencida» no tienen ícono (DESIGN.md: texto, ícono y tono; en el Centro de Control son `money_off` y `event_busy`). | (a) `document.title` por ruta (`head` de TanStack Router o un `useEffect` en cada página). (b) «Ningún cliente coincide con «{q}». Puedes registrarlo sin cuenta.». (c) `<Cargando filas={2} />`. (d) `icon={<MoneyOff />}` y `icon={<EventBusy />}`. |

Fuera de la tabla, por si se quiere pulir: el panel del agente muestra el `traceId` crudo («Traza: 4bf9… en Jaeger», `cc-tablero/.../agente.ts:64`). Es texto técnico, pero solo lo ve el gerente y sirve para la demo de observabilidad. Lo dejaría así.

## Mal cerrados de la vuelta 1

| id | estado declarado | qué falta | ver |
|---|---|---|---|
| V1-13 | hecho | Quedan tres lugares: un «—» en el tablero, «datos al Sin dato» en Conducción y «Riesgo Sin dato» en el popup del mapa. | V3-3, V3-4, V3-5 |
| V1-11 | hecho | Ya no se repite el aviso, pero con él se fue el «Reintentar». | V3-7 |
| V1-9 | hecho | El centrado quedó bien. El aviso nuevo miente cuando Viajes está caído y no se anuncia. | V3-6 |
| V1-15 | hecho | El chip cambió, pero el detalle del servicio lo repite en `warning`. Además, el texto nuevo es largo para un chip. | V3-8, V3-10 |
| V1-14 | hecho | La estructura está bien (ver abajo), pero «en una línea» no está garantizado con un nombre normal. Sigue sin probarse a 375 px. | V3-9 |

Verificados y bien cerrados:

- **V1-1 y V1-3:** `textoTope` dice la verdad en los tres casos, con prueba. Mantenimientos pasó a `corte`.
- **V1-2:** el efecto se para con `isFetchNextPageError`, con prueba de dos llamadas y reintento.
- **V1-4:** «Ver detalle» sin `rule` para quien no es despachador.
- **V1-5:** `?de=` llega por `withComponentInputBinding` (`ui-comun/src/lib/proveedores.ts:25`) y `colaDeOrigen` usa `Object.hasOwn` sobre una lista cerrada. `__proto__`, `toString` y `//evil.com` caen en Viajes, con prueba. No hay redirección abierta porque la ruta se arma desde la clave validada. El «volver» usa `memoria.de(ruta)` y devuelve la cola con sus filtros.
- **V1-6:** `--mat-sys-advertencia` existe en `libs/design-tokens/generado/angular-material.css`. Chip, tablero y mapa usan `aviso`, y está documentado.
- **V1-7, V1-8 (con prueba), V1-10 (con prueba y `campo && !campos[campo]`, que también calla al padre `viaje`) y V1-12:** los `title` coinciden con el `h1` en las cuatro apps. En los detalles queda el genérico («Viaje», «Unidad»), que es aceptable.
- **A-3:** `HitoNuevo.origen` y `Entrega.tipo` están en la tabla. **A-1:** la nota coincide con el CSS.
- **Cotizaciones sin ids:** cliente y ruta nunca salen crudos, con prueba.
- **PAGO_DUPLICADO por medio y referencia: sin falsos positivos.** El índice de Finanzas es `UNIQUE (factura_id, medio, referencia)` (`crear_pagos.php:22`) y `RegistrarPago` busca con `porReferencia($facturaId, $medio, trim($referencia))`. El front recarga **esa** factura y compara medio y referencia con `trim`, en el mismo orden y sin cambiar mayúsculas. Si encuentra una fila, es justo el pago con el que chocó. El único caso sin coincidencia es que falle la recarga, y para eso hay una frase propia.
- **`display: contents` en el marco del portal:** la caja es un `div` sin rol, así que sacarla del árbol de accesibilidad (el fallo conocido de WebKit con `display: contents`) no quita semántica. La `AppBar`, el `h1` y la banda (`role="alert"` del `Alert`) siguen como hijos. Con el padre en `contents`, el bloque contenedor de la banda `sticky` pasa a ser `#root`, que ocupa toda la página, así que la banda se queda fija en todo el recorrido. Desde `md` la caja vuelve a `block` + `sticky` y la banda queda `static` dentro de ella. El código es correcto. Falta mirarlo en Safari de iOS (ver el veredicto).

## Veredicto final

**El flujo se puede mostrar con mouse en el Centro de Control y en el portal**, siempre que antes se cierre V3-1. En el Centro de Control no queda ningún botón muerto por rol ni enum crudo, el patrón (encabezado y migas, lista con tope honesto, detalle con la decisión primero, confirmación en línea, vacío, carga y error) es el mismo en todas las pantallas, y las colas devuelven a su origen. Lo que queda son detalles de texto y de tono (P3).

En el portal, V3-1 bloquea el uso con teclado y lector de pantalla del flujo principal del cliente (abrir y cancelar un servicio). Es un arreglo de pocas líneas y lo haría antes de mostrarlo. V3-2 es el siguiente.

Además, siguen abiertos los de `web-vuelta-2.md` que corrige la vuelta 4: V2-1 («No, volver» en la factura) y V2-2 y V2-3 (bloqueo por ítem). Sin ellos, administración y el despachador pueden quedar trabados en una demostración.

Solo se puede comprobar en el navegador:

- La banda comercial a 375 px en Safari de iOS y en Chrome de Android: que quede `sticky` sola, en cuántas líneas cae con un nombre real (V3-9) y que no tape el campo enfocado al tabular (WCAG 2.4.11; si lo tapa, `scroll-padding-top` en `html`).
- El chip largo de V3-10 en el encabezado del detalle.
- El contraste del marcador ámbar sobre las teselas de OpenStreetMap, en tema claro y oscuro.
- Que el «Ver pagos» del aviso de PAGO_DUPLICADO lleve el foco al `h2` y que la fila marcada se vea.
- El pendiente de la vuelta 2: si `recargar` limpia el error de un `watch` que había fallado sin datos.
- Los dos pendientes de backend no se pueden ver sin servidor: Viajes devuelve los 80 más antiguos, y el Gateway no reenvía `pagoId` ni `saldo`.

## Estado vuelta 5

Hecho en la quinta vuelta de la cola. Pasan `generar:verificar`, `formato`, `capas`, `complejidad`, `probar` y `construir` del Centro de Control, y `npm run verificar` del portal. Nada se probó en un navegador.

Conteo: hecho 20 (15 de V3 y 5 mal cerrados de V1), más 2 arreglos en páginas que la revisión no cubrió · pendiente backend 2 · descartado 1.

### Hecho

| id | qué se hizo |
|---|---|
| V3-1 | `compartido/ui/Enlace.tsx`: enlace de MUI con `createLink` de TanStack Router (un `<a href>` real). En Mis servicios la fecha del pedido es el enlace al detalle; en Facturas, una columna «Servicio» con «Ver servicio». La fila sigue clicable como atajo del mouse y no navega dos veces si el clic cayó en el enlace (`desdeEnlace`). Prueba con el router real: Tab hasta el enlace y Enter abren el detalle (`features/tablas-teclado.test.tsx`, `@testing-library/user-event`). En el Centro de Control no hay filas con `(click)`: todas abren por `routerLink`. |
| V3-2 | «Factura N» en el detalle del servicio enlaza a `/facturas/$facturaId`, con prueba. |
| V3-3 | «Sin dato» en Cuentas por cobrar del tablero. |
| V3-4 | «· datos al …» solo si hay `datosAl`. |
| V3-5 | El popup del mapa solo agrega «Riesgo de retraso N %» si llega `riesgo`, con prueba. |
| V3-6 | «Ese viaje aún no reporta posición» no sale si Viajes no respondió (error sin viajes). El `<p role="status">` vive siempre en el DOM y solo el texto entra y sale. |
| V3-7 | `cc-aviso-servicios` acepta un aviso `[extra]` de la página, con el mismo «Reintentar». Líneas de crédito lo usa para «No se pudo leer la línea de N clientes». Prueba en `aviso-servicios.spec.ts`. |
| V3-8 | El `Alert` de `REQUIERE_INTERVENCION` pasa a `info` y agrega lo que el chip no dice: «Te avisaremos por correo cuando se resuelva; no tienes que hacer nada». |
| V3-9 | Banda comercial en `xs`: sin ícono y la línea «Atendiendo a: …» en una sola línea con «…»; el texto completo queda en `title` y en el DOM para el lector. |
| V3-10 | Chip: «Resolviendo un imprevisto». |
| V3-11 | `medioEnFrase` en `domain/pago.ts` («en efectivo», «por transferencia», «por depósito», «con cheque»), con prueba; lo usan el resumen y el aviso de PAGO_DUPLICADO. |
| V3-12 | La referencia del pago repetido lleva «(ya registrado)» oculto a la vista. |
| V3-13 | El enlace de la acción dice «Ver viaje»; la placa o «Sin unidad» va fuera. |
| V3-14 | Subtítulo de Intervenciones sin «compensación» y botón «Reintentar la liberación». El valor `REINTENTAR_COMPENSACION` no cambia. |
| V3-15 | (a) `document.title` por ruta (`compartido/ui/titulo.ts`, con prueba). (b) «Ningún cliente coincide con «q». Puedes registrarlo sin cuenta.». (c) `Credito` muestra `<Cargando filas={2} />`. (d) Íconos `MoneyOff` y `EventBusy` en los chips. |
| V1-13, V1-11, V1-9, V1-15, V1-14 | Cerrados con V3-3/4/5, V3-7, V3-6, V3-8/10 y V3-9. |
| Cotizar (no revisada) | Con la cotización ya aceptada, el aviso ofrece «Ver servicios» (antes, callejón). La ruta desconocida dice «Ruta: Sin dato» en vez de «Ruta». |
| Detalle del servicio | La línea de carga, toneladas, fecha y monto ya no muestra «undefined t» ni separadores sueltos si falta un dato. |
| Mi empresa (no revisada) | Sin hallazgos: todos los campos son obligatorios en el contrato, no hay enlaces por fila ni texto técnico. |

### Pendiente backend

- Viajes devuelve los 80 viajes más antiguos (ya anotado en la vuelta 2).
- El Gateway no reenvía `pagoId` ni `saldo` en los errores de pago (ya anotado; el front tiene su respaldo).

### Descartado

- `traceId` en el panel del agente: solo lo ve el gerente y sirve para la demo de observabilidad, como propone la revisión.

### Solo en el navegador (sin comprobar)

La banda a 375 px en Safari de iOS y Chrome de Android, el chip corto en el encabezado del detalle, el contraste del marcador ámbar, el foco de «Ver pagos» y si `recargar` limpia el error de un `watch` que falló sin datos.
