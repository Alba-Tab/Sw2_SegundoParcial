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

Las fuentes (Roboto y Material Symbols) se sirven desde el hosting de cada app, empaquetadas desde npm; nunca desde Google Fonts.

## Escala tipográfica

Cada paso de título es al menos 1,25 veces el siguiente. Definida una sola vez en `frontends/centro-control/projects/ui-comun/src/estilos/base.css`.

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

Las alertas del marco no llevan raya lateral: ícono de severidad, texto de severidad («Severidad crítica») y fondo tintado con el contenedor del tono.

## Iconografía

Material Symbols Outlined (paquete `material-symbols`), cargado en `base.css` y fijado como fuente por defecto de `<mat-icon>` en `configurarApp`. En el portal, `@mui/icons-material`.

- **Un ícono, un significado.** No se reutiliza un ícono para otra idea.
- El ícono acompaña al texto; no lo reemplaza. Si va solo (botón de ícono), lleva `aria-label`.
- El ícono es decorativo: `aria-hidden="true"` (lo ponen `mat-icon` y los íconos de MUI). El texto va fuera del `<mat-icon>`.

| Ícono | Significado |
|---|---|
| `check_circle` | Hecho, disponible, pagado |
| `hourglass_top` | En espera de otro (confirmación, aprobación, pago) |
| `route` | En ruta, en viaje |
| `warning` | Hay que revisarlo (observación, mantenimiento pendiente) |
| `error` | Falla o intervención requerida |
| `block` | Rechazado |
| `cancel` | Cancelado |
| `lock` | Cerrado |
| `event_busy` | Vencido |
| `build` | Mantenimiento |
| `schedule` | Riesgo de retraso |
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
| `search`, `search_off`, `filter_alt_off` | Buscar, sin resultados, limpiar filtros |
| `arrow_back`, `logout` | Volver, cerrar sesión |

**Secciones y menú.** Cada pestaña lleva su ícono y el portal usa el mismo para la misma idea:

| Ícono | Sección |
|---|---|
| `dashboard`, `bar_chart`, `mic`, `smart_toy` | Tablero, Reportes, Pregunta por voz, Agente (y Acciones del agente) |
| `route` | Viajes |
| `map` | Mapa en vivo |
| `warning`, `error` | Entregas observadas, Intervenciones (los mismos íconos de su estado) |
| `assignment` | Servicios (portal: «Mis servicios») |
| `local_shipping`, `local_gas_station`, `speed` | Unidades, Combustible, Conducción |
| `receipt_long` | Facturas |
| `account_balance_wallet`, `credit_score`, `request_quote` | Cuentas por cobrar, Aprobación de crédito, Cotizaciones (portal: «Cotizar») |
| `business`, `groups` | Portal: Mi empresa, Clientes |

En el portal la página actual se marca con fondo y peso en el botón del menú, no con subrayado.

## Patrones de página

**Encabezado.** `<cc-encabezado>` en toda página: `h1` con el nombre de la página o del objeto («Viaje ABC-123») y su estado (`cc-estado` proyectado), subtítulo opcional y las acciones proyectadas a la derecha. En un detalle lleva migas (`Unidades › ABC-123`) y el botón de volver a la lista; si se llegó desde otra app con `?desde=<app>`, ofrece «Volver a <app>». Una sola acción primaria (`mat-flat-button`) por pantalla. En el portal, el detalle empieza con «Volver a …» (ícono `ArrowBack`).

**Lista.** Tabla de Material dentro de `.tabla-ancha` (scroll horizontal en pantallas angostas). La primera columna enlaza al detalle. El estado va en su columna con `cc-estado`. Si un servicio no responde, `cc-aviso-servicios` dice cuál y la tabla muestra lo que haya.

- `controlLista({ filas, texto, estado, orden, ordenInicial })` (ui-comun) busca sin tildes, filtra por estado, ordena y pagina en el navegador. Las funciones puras viven en `ui-comun/dominio/src/lista.ts`. El filtro vive en la URL (`q`, `estado`, `orden`, `dir`, `pagina`, `tamano`; con `prefijo` si hay dos listas en la página), así volver desde el detalle lo conserva y un enlace puede abrir la lista ya filtrada (`/unidades?estado=MANTENIMIENTO_PENDIENTE`).
- Arriba `<cc-filtros-lista>`: búsqueda con etiqueta que dice por qué busca, selector de estado con las opciones de `ETIQUETAS` y el número de resultados con `role="status"`. Filtros propios de la página van proyectados y también en la URL (`lista.parametro()`, `lista.poner()`).
- En la tabla, `matSort` con `mat-sort-header` (pone `aria-sort`). Los montos se ordenan en centavos (`aCentavos`), nunca en float.
- Abajo `<cc-pie-lista>`: sin resultados por filtro, «No hay … con ese filtro» y «Limpiar filtros»; sin datos, el texto propio de la lista; si no, el paginador en español.
- Una lista de tarjetas con formularios (aprobaciones, acciones del agente) usa el mismo control sin `matSort`.

**Detalle.** Encabezado con el estado y las acciones (el botón de la acción abre su formulario debajo, con `aria-expanded`); si hay una decisión pendiente (entrega observada, intervención), va primero. Los datos van en una lista de definiciones `<dl class="datos">` (dos columnas, una en pantallas angostas; `.completo` ocupa el ancho), nunca en párrafos `<b>Etiqueta:</b> valor` ni en tarjetas anidadas. Después, las secciones con `h2` (riesgo, entrega, bitácora, pagos, mantenimientos). Los formularios de una acción van en su propia tarjeta con título en verbo («Registrar pago», «Programar mantenimiento»).

**Tablero.** Primero «Pide acción»: lista de lo que hay que resolver (viajes en riesgo, facturas vencidas, unidades con mantenimiento pendiente, alertas abiertas), cada línea con ícono, tono de fondo y enlace a la app que lo resuelve con `?desde=cc-tablero`; si un servicio cae, la línea dice cuál en vez de callar. Después «Cifras del periodo» en una franja compacta y, al final, el detalle (viajes en curso, próximas a vencer). Sin grilla de tarjetas con cifra gigante.

**Vacío, carga y error.** Barra de progreso indeterminada mientras carga sin datos; en una lista, `cc-pie-lista` dice qué pasa y cuál es el siguiente paso; `cc-aviso-servicios` cuando falla una fuente.
