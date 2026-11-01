# Diseño

Sistema visual del Centro de Control (Angular Material 3) y del Portal del cliente (MUI 7). El criterio de producto está en `PRODUCT.md`. Este archivo describe lo que el código ya usa; no hay marca propia más allá de la semilla de color.

## Tokens

Un solo origen: `libs/design-tokens` (Style Dictionary). No se escriben colores, tamaños ni radios a mano en los componentes.

| Grupo | Origen | Cómo se usa |
|---|---|---|
| Color | `tokens/color.json`: Material 3 *tonal spot* desde la semilla `#1D5FA6`, claro y oscuro, más `exito` y `advertencia` | Angular: `var(--mat-sys-primary)`, `var(--mat-sys-exito-container)`… (`generado/angular-material.css`). Portal: `palette.*` de `generado/mui.js` |
| Tipografía | `tokens/base.json` (`fuente.base` = Roboto, `fuente.mono` = Roboto Mono) y la escala tipográfica M3 de Angular Material | `font: var(--mat-sys-title-large)`; nunca `font-size` en px para texto de interfaz |
| Espacio | Múltiplos de 4 y 8 px (`espacio.1` = 4 … `espacio.8` = 32) | Márgenes y `gap` |
| Radios | `radio.sm` 8, `md` 12, `lg` 16, `completo` 999 | `var(--mat-sys-corner-*)` |

Tema oscuro: `data-tema="dark"` en `<html>` o la preferencia del sistema. Si un componente necesita un color en JavaScript (por ejemplo, Leaflet), lo lee del token con `getComputedStyle(document.documentElement).getPropertyValue('--mat-sys-…')`.

Las fuentes (Roboto y Material Symbols) se sirven desde el hosting de cada app, empaquetadas desde npm; nunca desde Google Fonts. Roboto es la variable de `@fontsource-variable/roboto` con un `@font-face` propio llamado «Roboto» y solo latín (43 KB) y latín extendido (29 KB, se baja si una página lo usa): en el Centro de Control en `ui-comun/src/estilos/fuentes.css` y en el portal en `src/compartido/tema/global.css`, que la PWA guarda para abrir sin conexión.

## Escala tipográfica

Cada paso de título es al menos 1,25 veces el siguiente. Definida una sola vez en `frontends/centro-control/projects/ui-comun/src/estilos/base.css`. Los títulos llevan `text-wrap: balance` y los párrafos, definiciones e ítems de lista `text-wrap: pretty`, para que ninguna palabra quede sola en la última línea (en el portal, en `global.css`).

| Uso | Token M3 | Tamaño / alto de línea | Razón con el siguiente |
|---|---|---|---|
| `h1`, título de página | `--mat-sys-headline-medium` | 28 / 36 px | 1,27 |
| `h2`, sección | `--mat-sys-title-large` | 22 / 28 px | 1,38 |
| `h3`, subsección y tarjeta | `--mat-sys-title-medium` | 16 / 24 px, peso 500 | Se distingue por peso |
| Texto y tablas | `--mat-sys-body-medium` | 14 / 20 px | |
| `.secundario`, ayudas, pie | `--mat-sys-body-medium` en `on-surface-variant` | 14 / 20 px | El contraste baja por color, no por tamaño |
| Detalle y fechas en menús | `--mat-sys-body-small` | 12 / 16 px | Mínimo; nunca para texto que hay que leer para decidir |
| Etiqueta de estado | `--mat-sys-label-large` | 14 / 20 px, peso 500 | |

## Estados

Un estado se muestra con **texto + ícono + tono**. El color nunca es la única señal y el valor crudo del enum nunca llega a la pantalla.

- Centro de Control: `ETIQUETAS` en `ui-comun/dominio/src/etiquetas.ts` (grupo por enum de `contratos/graphql/centro-control.graphql` y por campo `String` con valores cerrados en `contratos/openapi`). Componente `<cc-estado grupo="EstadoViaje" [valor]="v.estado" />`. Para lo que no es un estado (tipo de carga, de unidad, medio de pago) se usa solo el texto: `{{ v.tipoCarga | etiqueta: 'TipoCarga' }}`.
- Portal: `compartido/ui/EstadoServicio.tsx` (`EstadoServicio`, `EstadoFactura`), con el mismo ícono para el mismo significado.
- Un valor nuevo que el mapa no conoce sale legible y neutro («Nuevo estado», ícono `help`), nunca crudo. La prueba de `ui-comun` falla si un enum del esquema queda sin etiqueta.

| Tono | Cuándo | Fondo / texto (Angular) | Portal (MUI) |
|---|---|---|---|
| `neutro` | Terminado sin más acción, inactivo, cancelado | `surface-container-highest` / `on-surface-variant` | `default`, con borde |
| `info` | En curso, esperando a otro | `primary-container` / `on-primary-container` | `primary` |
| `exito` | Hecho y bien | `exito-container` / `on-exito-container` | `success` |
| `aviso` | Hay que mirarlo pronto | `advertencia-container` / `on-advertencia-container` | `warning` |
| `error` | Bloquea o falló; pide una decisión | `error-container` / `on-error-container` | `error` |

Las alertas del marco no llevan raya lateral: ícono de severidad, texto de severidad («Severidad crítica», en `label-large`, junto al título y no en el pie) y fondo tintado con el contenedor del tono. El estado de la alerta (abierta, atendida) va como texto en el pie: la severidad ya lleva ícono y tono, y dos chips en una línea de menú no se leen.

El reloj de arena (`hourglass_top`) siempre significa espera; el tono dice quién espera a quién. `info` si la empresa está trabajando y el cliente solo espera («Confirmando», «La empresa está resolviendo un imprevisto»); `aviso` si la espera tiene una decisión o un pago pendiente («En aprobación» de crédito, «Pago parcial», una acción del agente «Pendiente»).

Un número que pide mirarlo (km cerca del mantenimiento, puntaje de conducción bajo) lleva el ícono `warning` en línea (`.icono-en-linea`, en `base.css`) y un texto solo para el lector («, cerca del mantenimiento»), además del color.

**Lo bloqueado dice por qué y quién lo resuelve.** Una unidad que no puede salir, un botón que el rol no tiene o una acción que espera a otro dicen el motivo con lo que ya llega del servidor y quién lo destraba («No puede salir: lleva 10.380 km desde el último mantenimiento. Lo programa el jefe de flota.»); si no se sabe el motivo, una frase genérica, nunca un invento. Nada de botones grises sin explicación (`PRODUCT.md`, anti-referencias).

Excepción a «los estados con `cc-estado`»: el tipo de hito de la bitácora (`TipoHito`) se muestra como chip, porque su tono es lo que el despachador busca al recorrerla (bloqueo, falla mecánica).

## Iconografía

Material Symbols Outlined, fijado como fuente por defecto de `<mat-icon>` en `configurarApp`. No se sirve la fuente completa del paquete `material-symbols` (4 MB, unos 3 900 glifos): `frontends/centro-control/scripts/iconos.mjs --generar` la recorta a la lista cerrada de `ui-comun/dominio/src/iconos.ts`, con peso 400 y sin relleno (13 KB en WOFF). Para usar un ícono nuevo se agrega a esa lista y se corre `npm run iconos:generar`; `npm run probar` falla si el código usa uno que no está. Mientras la fuente carga, los íconos quedan ocultos (`font-display: block`, unos 3 s como máximo), así nunca se lee el nombre del glifo y, si la fuente tarda o falla, no quedan ocultos toda la sesión. En el portal, `@mui/icons-material`.

- **Un ícono, un significado.** No se reutiliza un ícono para otra idea.
- El ícono acompaña al texto; no lo reemplaza. Si va solo (botón de ícono), lleva `aria-label`.
- El ícono es decorativo: `aria-hidden="true"` (lo ponen `mat-icon` y los íconos de MUI). El texto va fuera del `<mat-icon>`.

| Ícono | Significado |
|---|---|
| `check_circle` | Hecho, disponible, pagado |
| `hourglass_top` | En espera de otro (confirmación, aprobación, pago) |
| `route` | En ruta, en viaje |
| `warning` | Hay que revisarlo (observación, mantenimiento pendiente o requerido, documento por vencer, puntaje bajo, «Datos al …» viejo) |
| `error` | Falla o intervención requerida |
| `block` | Rechazado |
| `cancel` | Cancelado |
| `lock` | Cerrado |
| `event_busy` | Vencido |
| `person_off` | Chofer inhabilitado |
| `money_off` | En mora |
| `build` | Mantenimiento |
| `schedule` | Riesgo de retraso |
| `event_available` | Confirmado (solo el estado; ningún botón lo usa) |
| `bookmark` | Unidad reservada |
| `assignment_ind` | Chofer ocupado (en viaje o reservado) |
| `do_not_disturb_on` | Unidad inactiva |
| `receipt_long` | Factura por cobrar (y la sección Facturas) |
| `radio_button_unchecked` | Alerta abierta |
| `check` | Alerta atendida y «Marcar atendida» (atender no es resolver: por eso no es `task_alt`) |
| `archive` | Acción del agente archivada |
| `sync`, `timer_off`, `skip_next` | Misión del agente en curso, agotada, saltada |
| `timer` | Cotización vigente |
| `event_repeat` | Preventivo, misión programada |
| `local_gas_station`, `query_stats` | Caída de combustible, anomalía de combustible |
| `wrong_location`, `draw` | Entrega fuera de la geocerca, sin firma |
| `info` | Severidad media |
| `remove` | Sin dato |
| `help` | Valor desconocido |
| `cloud_off` | Un servicio no responde (aviso de servicios, alertas no disponibles) |
| `notifications` | Alertas |
| `thumb_up` | Aprobar, aprobado |
| `send` | Enviar al cliente |
| `rule` | Revisar y decidir |
| `replay` | Reintentar |
| `task_alt` | Marcar resuelto |
| `price_check` | Registrar un pago |
| `document_scanner` | Leer un recibo (OCR) |
| `open_in_new` | Se abre en otra pestaña o app |
| `download` | Exportar |
| `account_circle`, `manage_accounts` | Menú del usuario, administrar usuarios |
| `search`, `search_off`, `filter_alt_off` | Buscar, sin resultados, limpiar filtros |
| `arrow_back`, `logout` | Volver, cerrar sesión |

**Secciones y menú.** Cada pestaña lleva su ícono y el portal usa el mismo para la misma idea:

| Ícono | Sección |
|---|---|
| `dashboard`, `bar_chart`, `mic`, `smart_toy` | Tablero, Reportes, Pregunta por voz, Agente (y Acciones del agente) |
| `route` | Viajes |
| `view_list`, `map` | Vistas de Viajes: Lista y Mapa en vivo |
| `pending_actions` | Decisiones (Operaciones): agrupa las dos colas de abajo |
| `warning`, `error` | Entregas observadas, Intervenciones (los mismos íconos de su estado) |
| `assignment` | Servicios (portal: «Mis servicios») |
| `local_shipping`, `local_gas_station`, `speed` | Unidades, Combustible, Conducción |
| `build`, `id_card` | Mantenimientos (el mismo ícono de «Mantenimiento»), Choferes |
| `groups`, `alt_route` | Clientes, Rutas |
| `receipt_long` | Facturas |
| `account_balance_wallet`, `credit_score`, `request_quote` | Cuentas por cobrar, Aprobación de crédito, Cotizaciones (portal: «Cotizar») |
| `credit_card` | Líneas de crédito |
| `business`, `groups` | Portal: Mi empresa, Clientes |

Los tipos que no son estados (carga, unidad, remolque, documento, hito, medio de pago, canal, rol) también tienen ícono en `ETIQUETAS`, pero en pantalla salen solo como texto con el pipe; la excepción es el tipo de hito, arriba.

En el portal la página actual se marca con fondo y peso en el botón del menú, no con subrayado.

## Patrones de página

**Navegación de sección.** Pestañas `mat-tab-nav-bar` con ícono y texto, alineadas a la izquierda y con su propio ancho (`MAT_TABS_CONFIG` con `stretchTabs: false` en `configurarApp`), **seis como máximo**. Si una app necesita más, se agrupan: Operaciones lleva el mapa como vista dentro de Viajes y las dos colas en Decisiones. La pestaña y el `h1` de la página que abre dicen lo mismo («Conducción» abre «Conducción»). El portal sigue la misma regla en su menú.

**Ancho mínimo.** Todo se usa a 375 px sin desborde horizontal de la página: la tabla se desplaza dentro de `.tabla-ancha`, la barra común se pliega bajo 900 px (las apps en el menú «Apps» y el usuario solo con su ícono) y bajo 600 px el estado pasa a segunda columna de la lista.

**Enlaces.** Color `primary` del tema, en claro y en oscuro, con subrayado (`:where(a)` en `base.css`, sin pisar botones ni menús; en el portal, `Link` de MUI). Nunca el azul del navegador ni un color escrito a mano. Las fichas se enlazan entre sí: dentro de la app con `routerLink`; hacia otra app con `urlEnApp` y `?desde=<app>`, solo si el rol la abre, para que el destino ofrezca «Volver a …».

**Un dato, una dueña.** Si un dato aparece en dos apps, una es la fuente y la otra lo resume y enlaza a ella: la línea de crédito y la cobranza son de Finanzas; la ficha del cliente en Operaciones muestra el estado y el disponible y lleva a «Ver la línea en Finanzas».

**Encabezado.** `<cc-encabezado>` en toda página: `h1` con el nombre de la página o del objeto («Viaje ABC-123») y su estado (`cc-estado` proyectado), subtítulo opcional y las acciones proyectadas a la derecha. En un detalle lleva migas (`Unidades › ABC-123`) y el botón de volver a la lista; si se llegó desde otra app con `?desde=<app>`, ofrece «Volver a <app>». Una sola acción primaria (`mat-flat-button`) por pantalla: el botón del encabezado que abre un formulario es `mat-stroked-button` y solo el envío del formulario abierto es `mat-flat-button`. En el portal, el detalle empieza con «Volver a …» (ícono `ArrowBack`).

**Lista.** Tabla de Material dentro de `.tabla-ancha` (scroll horizontal en pantallas angostas). La primera columna enlaza al detalle. El estado va en su columna con `cc-estado`. Si un servicio no responde, `cc-aviso-servicios` dice cuál y la tabla muestra lo que haya.

- `controlLista({ filas, texto, estado, orden, ordenInicial })` (ui-comun) busca sin tildes, filtra por estado, ordena y pagina en el navegador. Las funciones puras viven en `ui-comun/dominio/src/lista.ts`. El filtro vive en la URL (`q`, `estado`, `orden`, `dir`, `pagina`, `tamano`; con `prefijo` si hay dos listas en la página), así volver desde el detalle lo conserva (el «volver» y la miga del encabezado llevan la última consulta de la lista, `MemoriaListas`) y un enlace puede abrir la lista ya filtrada (`/unidades?estado=MANTENIMIENTO_PENDIENTE`). Con `estadoInicial` la lista entra mostrando lo que pide acción (Servicios: confirmados, para quien cancela) y «Todos» queda en la URL como `estado=todos`.
- Arriba `<cc-filtros-lista>`: búsqueda con etiqueta que dice por qué busca, selector de estado con las opciones de `ETIQUETAS` y el número de resultados con `role="status"`. Filtros propios de la página van proyectados y también en la URL (`lista.parametro()`, `lista.poner()`).
- En la tabla, `matSort` con `mat-sort-header` (pone `aria-sort`); el orden alterna asc y desc, sin «sin orden». Los montos se ordenan en centavos (`aCentavos`), nunca en float, y el estado por su lugar en el ciclo de vida (`posicionEstado`), no alfabético.
- Si la consulta tiene tope (`limite: 80` en Viajes y Servicios; 100 en clientes, choferes y mantenimientos, el máximo del Gateway sin cursor), `[limite]` en `cc-filtros-lista` dice «Se muestran los primeros N…» cuando llega al tope. Si el filtro de estado ya lo aplicó el servidor (`[estadoEnServidor]`), el conteo no dice «de N».
- Abajo `<cc-pie-lista>`: sin resultados por filtro, «No hay … con ese filtro» y «Limpiar filtros»; sin datos, el texto propio de la lista; si no, el paginador en español.
- Una lista de tarjetas con formularios (aprobaciones, acciones del agente) usa el mismo control sin `matSort`.

**Detalle.** Encabezado con el estado y las acciones (el botón de la acción abre su formulario debajo, con `aria-expanded`); si hay una decisión pendiente (entrega observada, intervención), va primero. Los datos van en una lista de definiciones `<dl class="datos">` (dos columnas, una en pantallas angostas; `.completo` ocupa el ancho), nunca en párrafos `<b>Etiqueta:</b> valor` ni en tarjetas anidadas. Después, las secciones con `h2` (riesgo, entrega, bitácora, pagos, mantenimientos). Los formularios de una acción van en su propia tarjeta con título en verbo («Registrar pago», «Programar mantenimiento»).

**Tablero.** Primero «Pide acción»: lista de lo que hay que resolver (viajes en riesgo, facturas vencidas, unidades con mantenimiento pendiente, alertas abiertas), cada línea con ícono, tono de fondo y enlace a la app que lo resuelve con `?desde=cc-tablero`; si un servicio cae, la línea dice cuál en vez de callar. Después «Cifras del periodo» en una franja compacta y, al final, el detalle (viajes en curso, próximas a vencer). Sin grilla de tarjetas con cifra gigante. El orden de «Pide acción» es de urgencia: viajes en riesgo (el más probable arriba), facturas vencidas, mantenimiento pendiente y alertas abiertas. El tono de cada línea es el de su estado en el resto de la interfaz: el riesgo es `aviso`, igual que su chip (es una predicción, no una falla), y la factura vencida es `error`. Un rol que no ve ningún bloque que pueda pedir acción (comercial) no tiene la sección: «Nada pide acción» sería una afirmación que no puede saber.

**Vacío, carga y error.** Mientras no llega la primera respuesta, esqueleto con la forma de lo que viene (`<cc-esqueleto>`; en una lista lo pone `cc-pie-lista` con `[cargando]` y el contador dice «Cargando…»; en el portal, `Cargando`), nunca «No hay …» ni «0 viajes» antes de tiempo. En una lista vacía, `cc-pie-lista` dice qué pasa y cuál es el siguiente paso.

Tres errores distintos, cada uno con su ícono y su salida, nunca mezclados:

| Caso | Ícono | Texto | Salida |
|---|---|---|---|
| Un servicio no responde | `cloud_off` | Lo que no se pudo cargar, no el nombre técnico: «No se pudieron cargar los viajes de este cliente: Viajes no responde.» | «Reintentar» |
| No existe (`NO_ENCONTRADO`, o el id no está en la lista) | `search_off` | «No encontramos esta unidad. Puede que el enlace esté mal o que ya no exista.» | Solo «Volver»: reintentar no lo arregla |
| Sin permiso (`SIN_PERMISO`, ruta que el rol no abre) | Por decidir: `lock` ya significa «Cerrado» | Qué no puede hacer y quién sí («Lo programa el jefe de flota»); la página `/sin-acceso` dice a quién pedir el rol | Volver o ir a la app que sí abre |

**Lo ya mostrado no desaparece por un fallo.** Un sondeo que falla no vacía la tabla: `conservarUltimoBueno` (`ui-comun/src/lib/sondeo.ts`) deja las últimas filas buenas y `cc-aviso-servicios [datosAl]` dice el error con «Se muestran los datos al …» junto a «Reintentar». «Datos al …» de Analítica (`<cc-datos-al>`, tablero, reportes y conducción) pasa a tono `aviso`, con `warning` y «las cifras pueden no estar al día», cuando lleva más de 30 minutos sin datos nuevos (`MINUTOS_DATOS_VIEJOS` en `ui-comun/dominio/src/formato.ts`): con viajes en ruta llegan posiciones e hitos cada pocos minutos, así que media hora sin nada ya es para mirarlo; no afirma una falla, porque también pasa cuando no hay operación. El texto de un error sale del `codigo` de 000 §5 (`ui-comun/dominio/src/errores.ts`; portal: `compartido/ui/Problema.tsx`), nunca del mensaje del servidor.

**Valor vacío.** Un dato que falta se escribe siempre «Sin dato», en fichas (`<dd>`), celdas de tabla y cifras, en el Centro de Control y en el portal. Es el mismo texto de `etiqueta()` para un enum nulo y de los pipes `bob` y `fecha` y de `pct` (`SIN_DATO` en `ui-comun/dominio/src/formato.ts`). Nada de guion largo: un lector de pantalla no lo lee y en una ficha parece un error de carga. Si la frase entera depende del dato («Datos al …»), no se muestra.

**Números.** Todo número visible con decimales o de cuatro cifras o más pasa por un formateador `es-BO`: miles con punto y decimales con coma («1.300 km», «25,5 t», «0,65»). En el Centro de Control, el pipe `numero` (y la función `numero` de `ui-comun/dominio` en código); el dinero, `bob` («2.800,00 BOB», en centavos, sin float); los porcentajes, `pct`. En el portal, `numero`, `dinero` y `porcentaje` de `compartido/formato/formato.ts`. Nunca el pipe `number` de Angular sin locale (escribe «1,300», que en Bolivia se lee 1,3), `DecimalPipe`, `toFixed` ni el valor crudo en pantalla. No se cambia `LOCALE_ID` (movería las fechas de Material). Un puntaje dice su escala junto al número («Puntaje (0 a 100)», «Puntaje de anomalía (0 a 1)») y la interfaz no inventa una severidad que el servidor no da. Las coordenadas van con coma decimal y punto y coma entre latitud y longitud («-17,7833; -63,1821»).

**Riesgo de retraso.** Es `aviso` en todas partes: el chip, la línea de «Pide acción» del tablero y el marcador del mapa (`--mat-sys-advertencia`). Es una predicción, no una falla; `error` queda para lo que ya salió mal (factura vencida, entrega rechazada).

**Formularios.** `ReactiveForms` con un `<mat-error>` en español bajo cada campo (`textoError`, reglas en `ui-comun/dominio/src/validacion.ts`). El botón de enviar queda activo: al enviar con errores se marcan todos los campos y se enfoca el primero inválido (`listoParaEnviar`; cada componente con formularios importa la directiva `Campo` junto a `ReactiveFormsModule`, que registra el elemento de cada `[formControl]` y `formControlName`). Los montos se escriben como texto decimal con punto («2800.50») y se validan sin pasar por `Number`. Un texto que se exige solo para una de las acciones (motivo para rechazar) lo fija `exigirTexto`. Al abrir un formulario, el foco va a su primer campo; al cerrarlo, vuelve al botón que lo abrió. En el portal, react-hook-form con zod (`shouldFocusError`) y el mismo criterio.

**Acciones que no se deshacen** (registrar pago, rechazar entrega, cerrar mantenimiento, rechazar una acción del agente, rechazar un crédito): confirmación en línea con `<cc-confirmacion>`, que dice qué va a pasar con los datos («Se registra un pago de 2.800,00 BOB…») y toma el foco. Mientras se confirma, el formulario queda bloqueado (lo que dice el resumen es lo que se envía); «No, volver» o un envío fallido lo desbloquean y devuelven el foco al botón que pidió la confirmación; tras el éxito, si ese botón ya no existe, el foco va al `h1`. Cancelar un servicio usa su propia confirmación en la fila (resumen, motivo y «Sí, cancelar el servicio»), con el resumen asociado al campo por `aria-describedby`. Cerrar un mantenimiento exige todos los ítems marcados (spec 010). En el portal, el diálogo de cancelar ya era la confirmación.

**Accesibilidad.** Foco visible (`:focus-visible` con `primary`), objetivos de 44 px en pantallas táctiles (enlaces de tablas y datos), sin texto atenuado con `opacity`, sin desborde a 375 px («Ancho mínimo») y sin animaciones si el sistema pide menos movimiento. Contraste AA calculado con los tokens (texto sobre fondo y sobre cada contenedor de tono, claro y oscuro): el par más bajo es `primary` sobre `advertencia-container`, 4,96 en claro (el botón «No, volver» dentro de `cc-confirmacion`); pasa AA para texto normal (4,5).
