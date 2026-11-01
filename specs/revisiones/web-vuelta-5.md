# Revisión web, vuelta 5 (commit 6415f8b)

Alcance: el commit `6415f8b`, que corrige `web-vuelta-3.md` («Estado vuelta 5»), sus regresiones y una pasada final de pulido sobre las cuatro apps del Centro de Control y el portal: textos (tildes, mayúsculas, verbos), íconos según DESIGN.md y patrones (encabezado, lista, detalle, confirmación, vacío, carga y error). Solo frontend. Las líneas son las de `6415f8b`. No repito lo que ya está en `web-vuelta-4.md` (V4-1 a V4-5 y el foco de los botones deshabilitados), que otro trabajo está corrigiendo.

En una copia descartable del árbol en `6415f8b` (ya borrada) pasaron `npm run verificar` del portal (tipos, lint, formato y 51 pruebas) y `npm run probar` del Centro de Control (iconos, ui-comun 106, cc-operaciones 22, cc-finanzas 16, cc-tablero 30, cc-flota 12). Nada se probó en un navegador.

Conteo: P0 0 · P1 0 · P2 0 · P3 8.

## Hallazgos

| id | sev | archivo:línea | problema | arreglo concreto |
|---|---|---|---|---|
| V5-1 | P3 | `cc-operaciones/src/app/acciones/ui/acciones.ts:76` | V3-13 dejó «Ver viaje» con mayúscula, pero en la misma línea el otro enlace sigue con minúscula: «· Ver viaje · ver la misión del agente». Son dos enlaces seguidos con criterios distintos. | «Ver la misión del agente». |
| V5-2 | P3 | `cc-operaciones/src/app/viajes/ui/entregas.ts:29`, `viajes/ui/intervenciones.ts:30`, `cc-flota/src/app/mantenimientos/ui/mantenimientos.ts:43` | Los subtítulos de las colas no hablan con la misma voz. Intervenciones ahora tutea («reintenta o márcalo resuelto en el viaje»), igual que Mantenimientos («abre la unidad.»), y Entregas observadas, la cola de al lado, sigue impersonal («se aprueban o rechazan en el viaje»). Además, solo Mantenimientos termina con punto. PRODUCT.md usa el tuteo («Pide una nueva.»). | Entregas: «Fuera de la geocerca o sin firma: apruébalas o recházalas en el viaje». Quitar el punto final de Mantenimientos (o ponerlo en los tres). |
| V5-3 | P3 | `portal-cliente/src/features/comercial/PaginaClientes.tsx:48-56` | El texto nuevo «Ningún cliente coincide con «q»…» aparece y desaparece mientras se escribe, pero no está en una región viva: con lector de pantalla, el comercial no se entera de que la búsqueda no encontró nada (WCAG 4.1.3). Además, la carga usa `CircularProgress`, cuando DESIGN.md pide `Cargando` en el portal. | Un `<Typography role="status">` que siempre esté en el DOM y con el texto adentro solo cuando `items.length === 0`, el mismo patrón que V3-6. Para la carga, `Cargando filas={3}` en lugar del spinner, o al menos dejar el spinner dentro de esa misma región. |
| V5-4 | P3 | `portal-cliente/src/features/cotizar/PaginaCotizacion.tsx:52` | El botón nuevo «Ver servicios» es `size="small"` y no tiene `minHeight: 44`. Todos los botones de acción del portal que van dentro de un `Alert` (el «Reintentar» de `Problema.tsx:53`, «Cambiar cliente») sí lo tienen. En un celular queda como un blanco de unos 30 px. | `sx={{ minHeight: 44 }}`, como en `Problema`. |
| V5-5 | P3 | `portal-cliente/src/compartido/ui/AvisoComercial.tsx:36` | En un celular (justo donde se corta el nombre), `title` no se ve: no hay hover. El comercial no tiene cómo leer la razón social completa desde la banda. Mientras carga el nombre, el `title` dice «Atendiendo a: » vacío. Lo propuse yo en V3-9, así que lo corrijo ahora. | Que el `title` solo se ponga si hay `nombre` (`title={nombre ? \`Atendiendo a: ${nombre}\` : undefined}`). Para el celular basta con que «Cambiar cliente» lleve a `/clientes`, donde el elegido sale marcado (`selected`) con su nombre completo; no hace falta más. Si se quiere, `whiteSpace: { xs: 'nowrap', sm: 'normal' }` para no cortar en escritorio. |
| V5-6 | P3 | `portal-cliente/src/features/servicios/PaginaServicio.tsx:106-112` | El enlace de «Última posición» abre OpenStreetMap en otra pestaña (`target="_blank"`) sin decirlo. En el Centro de Control, «Ver como cliente» sí lo dice (`cc-operaciones/.../cliente.ts:48`: ícono `open_in_new` y «(se abre en otra pestaña)» oculto a la vista). | Agregar `<Box component="span" sx={visuallyHidden}> (se abre en otra pestaña)</Box>` (`@mui/utils/visuallyHidden`) y, si se quiere el mismo ícono, `OpenInNew` con `fontSize="inherit"`. |
| V5-7 | P3 | `cc-tablero/src/app/agente/ui/agente.ts:31` | «Ver acciones propuestas →» lleva una flecha escrita como texto. El lector de pantalla la lee («flecha derecha») y es el único enlace del Centro de Control que la usa: el resto lleva el ícono de Material antes del texto («Volver a …», «Ver en el mapa»). | Quitar «→», o cambiarlo por `<mat-icon>arrow_forward</mat-icon>` si está en la lista cerrada de `iconos.ts` (si no está, basta con quitarlo). |
| V5-8 | P3 | `cc-finanzas/src/app/facturas/ui/factura.ts:121` | «Leer recibo (OCR)»: «OCR» es una sigla técnica que administración no necesita saber. PRODUCT.md pide no usar jerga técnica. | «Leer el recibo» (el ícono `document_scanner` ya dice que se escanea), o «Leer el recibo de la foto». |

## Mal cerrados de la vuelta 3

Ninguno. Los 15 hallazgos de V3 y los 5 mal cerrados de V1 están bien cerrados. Lo que comprobé:

- **V3-1 (P1), cerrado.** `Enlace` es `createLink` sobre el `Link` de MUI: un `<a href>` real, que recibe el foco y se abre con Enter. La prueba nueva (`features/tablas-teclado.test.tsx`) usa el router real, llega al enlace **solo con Tab** y abre el detalle con Enter, tanto en Mis servicios (la fecha del pedido) como en Facturas («Ver servicio»). No navega dos veces: el `onClick` de la fila descarta el clic con `desdeEnlace` (`closest('a')`), así que el enlace navega solo y Ctrl/Cmd+clic abre otra pestaña sin que la fila navegue también. En ninguna de las dos tablas hay otros botones en la fila que la fila pueda robar. Además, en Facturas la columna «Servicio» no es ordenable y ya no muestra un `TableSortLabel` muerto (`getCanSort()`). «Ver servicio» se repite en cada fila, pero el contexto de la fila y de la columna basta para WCAG 2.4.4 (AA). Falta una prueba de que el clic en el enlace no navega dos veces; el código es correcto.
- **V3-2, cerrado.** «Factura N» enlaza a `/facturas/$facturaId` si llega `facturaId`, y si no queda como texto. `conSaldo` empieza en `false`, así que una factura pagada también aparece y se enfoca.
- **V3-3, V3-4, V3-5 (V1-13), cerrados.** No queda ningún «—» en el tablero, «· datos al …» solo sale si hay fecha, y el popup del mapa agrega «Riesgo de retraso N %» solo si llega `riesgo`, con prueba.
- **V3-6 (V1-9), cerrado.** `viajesCaido` (error y ninguna fila) calla «aún no reporta posición». El `<p role="status">` está siempre en el DOM. `p:empty { margin: 0 }` funciona porque Angular deja como único hijo un comentario de anclaje, y `:empty` no cuenta los comentarios: no queda hueco. «Ver en el mapa» solo existe en un viaje `EN_RUTA`, así que el caso «el viaje no está en la lista» no se da.
- **V3-7 (V1-11), cerrado.** `[extra]` entra en `avisos()` y comparte el «Reintentar» (`refetchObservableQueries`, que vuelve a pedir la consulta activa de líneas). No se duplica: el campo `lineaCredito` sigue con nombre vacío en `campos`. Hay prueba en `aviso-servicios.spec.ts`.
- **V3-8 y V3-10 (V1-15), cerrados.** El chip dice «Resolviendo un imprevisto» (25 caracteres) y el `Alert` pasa a `info` y agrega lo que el chip no dice. Mismo ícono y tono de espera.
- **V3-9 (V1-14), cerrado en el código.** En `xs` la banda va sin ícono, en una línea `nowrap` con «…», y el `minWidth: 0` del mensaje deja encoger. El texto completo está en el DOM, así que el lector lo lee entero. El `title` tiene el detalle de V5-5. Falta mirarlo a 375 px.
- **V3-11 y V3-12, cerrados.** `medioEnFrase` arma «en efectivo», «por transferencia», «por depósito» y «con cheque», con prueba, y se usa en el resumen y en el aviso de PAGO_DUPLICADO. «(ya registrado)» va con `cdk-visually-hidden`, la misma clase que ya usan otras seis plantillas.
- **V3-13 y V3-14, cerrados.** «Ver viaje» con la placa (o «Sin unidad», con mayúscula como en Viajes) fuera del enlace. Intervenciones ya no dice «compensación» en pantalla, y el botón dice «Reintentar la liberación». Ver V5-1 y V5-2 para lo que quedó alrededor.
- **V3-15, cerrado.** (a) `tituloDe` coincide con el `h2` de cada página, con prueba. Mis servicios usa «Servicios», que es el nombre del menú del comercial, así que vale para los dos roles. (b) Hay texto de vacío, con el detalle de V5-3. (c) `Credito` muestra `Cargando` solo si está pidiendo datos; sin conexión, o en modo comercial sin cliente elegido, no muestra nada, que es lo correcto. (d) Los íconos `MoneyOff` y `EventBusy` son los mismos de la tabla de DESIGN.md.
- **Cotización aceptada:** ofrece «Ver servicios» y deja de ser un callejón. `Cotizacion` no trae `servicioId`, así que lo mejor que se puede hacer es ir a la lista. **Ruta desconocida:** «Ruta: Sin dato». **«undefined t»:** la línea del detalle arma solo las partes que llegaron, sin separadores sueltos.

## Pasada final de pulido: lo que ya está bien

- **Patrones.** El encabezado con migas y «volver», la lista con filtros, el tope y el pie, el detalle con la decisión primero, la confirmación en línea, y los estados vacío, carga y error con «Reintentar» son los mismos en las cuatro apps. El portal sigue su versión: «Volver a …» con `ArrowBack`, `Cargando`, `Problema` con «Reintentar» y un texto propio para la lista vacía (salvo V5-3).
- **Valor vacío.** No queda ningún «—» ni «undefined» en pantalla. «Sin dato» en celdas, fichas y cifras, y las frases que dependen del dato se omiten.
- **Íconos.** Un significado por ícono, en el Centro de Control y en el portal: `cloud_off` para lo que no se pudo leer, `replay` para reintentar, `money_off` y `event_busy` en los chips de crédito y factura, y el reloj de arena para la espera.
- **Verbos y mayúsculas.** Los botones empiezan con un verbo en infinitivo y mayúscula inicial («Guardar el pago», «Aprobar entrega», «Marcar resuelto», «Ver más»), y las confirmaciones dicen «Sí, …» y «No, volver». Las únicas excepciones son V5-1 y V5-7. No encontré tildes faltantes en los textos de pantalla del diff.

## Solo comprobable en el navegador

- La banda comercial a 375 px en Safari de iOS y Chrome de Android: que el nombre se corte en una línea y que «Cambiar cliente» no se parta en dos líneas. Las dos cajas del `Alert` encogen; si el botón se parte, conviene `whiteSpace: 'nowrap'` en el botón.
- Qué lee un lector de pantalla con el `title` del `div` de la banda. Chrome lo expone como descripción, y algunos lectores la leen después del texto: «Atendiendo a: X» dos veces. Si pasa, basta con quitar el `title` en `xs`.
- El chip «Resolviendo un imprevisto» junto al `h2` del detalle a 375 px.
- La tabla de Facturas, con una columna más, dentro del `overflowX: 'auto'` a 375 px.
- Los pendientes de la vuelta 4: el contraste del marcador ámbar, el foco de «Ver pagos» y el foco de los botones que pasan a `disabled`.

## Veredicto

La vuelta 5 cierra lo que bloqueaba: con V3-1 resuelto, el cliente y el comercial pueden abrir y cancelar un servicio solo con teclado, y hay una prueba con Tab y Enter sobre el router real que lo cubre. No encontré regresiones. Las pruebas, los tipos, el lint y el formato pasan en los dos frentes. Lo que queda son ocho P3 de texto, de blanco táctil y de anuncio, y ninguno traba una demostración. Si hay tiempo para uno solo, que sea V5-3, porque es el único que deja al lector de pantalla sin información. Los que siguen bloqueando la demostración del cobro son los de `web-vuelta-4.md` (V4-1, el saldo viejo en `PAGO_EXCEDE_SALDO`), que se están corrigiendo en la vuelta 6.

## Estado vuelta 7

Hecho:

- **V5-1.** «Ver la misión del agente», con mayúscula como «Ver viaje».
- **V5-2.** Entregas observadas tutea («apruébalas o recházalas en el viaje») y Mantenimientos pierde el punto final. Revisé el resto de los subtítulos del Centro de Control: Tablero y Cuentas por cobrar describen, no piden nada, así que no tienen verbo que tutear.
- **V5-3.** La búsqueda de clientes usa `Cargando filas={3}` y el texto de «sin resultados» vive en un `Typography role="status"` que siempre está en el DOM (se oculta con `:empty`).
- **V5-4.** «Ver servicios» lleva `minHeight: 44`.
- **V5-5.** La banda ya no usa `title`. Desde `sm` el nombre no se corta; en un celular sigue en una línea con «…» y, al tocarlo o enfocarlo (`tabIndex=0` solo en celular), se abre en las líneas que necesite.
- **V5-6.** El enlace a OpenStreetMap lleva el ícono `OpenInNew` y «(se abre en otra pestaña)» oculto a la vista, igual que «Ver como cliente».
- **V5-7.** Sin «→» en «Ver acciones propuestas» (`arrow_forward` no está en `iconos.ts`). La otra flecha escrita como texto, la ruta de cada acción propuesta («ABC-123 → Santa Cruz»), ahora dice «hacia Santa Cruz».
- **V5-8.** «Leer el recibo de la foto».

Descartado: nada.

Pendiente de navegador: la banda a 375 px al tocar el nombre (que se abra y vuelva a una línea al salir) y que el contorno de foco se vea sobre el ámbar.
