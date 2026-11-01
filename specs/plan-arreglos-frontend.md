# Plan de arreglos de los frontends web

Alcance: `frontends/centro-control` (4 apps Angular + `ui-comun`) y `frontends/portal-cliente` (React). La app del chofer queda fuera.
Base: revisión del código al 31-10-2026 con los criterios de `frontend-ui-engineering` e `impeccable` (registro **producto**: la interfaz sirve al trabajo, no se luce).

## 1. Diagnóstico

### 1.1 Navegación: callejones sin salida

| # | Dónde | Problema | Evidencia |
|---|---|---|---|
| N1 | Todas las páginas de detalle | No hay botón "volver" ni migas de pan. Solo queda el botón Atrás del navegador | `cc-operaciones/viajes/:id`, `acciones/:id`; `cc-flota/unidades/:id`, `combustible/:id`; `cc-finanzas/facturas/:id`; portal `servicios/$id`, `cotizaciones/$id`. `grep arrow_back` no da nada |
| N2 | `cc-tablero` | Reportes, Voz y Agente no tienen pestañas: se llega por enlaces de texto `·` junto al título y, una vez dentro, no hay forma de volver al tablero salvo la barra superior | `tablero.ts` (ENLACES), `app.routes.ts` sin `Seccion` |
| N3 | Barra común (`marco.ts`) | Saltar de app recarga la página entera (hosting distinto) y no se nota cuál es la app actual más allá de un fondo tenue. La marca "Transporte · X" no lleva al inicio | `marco.ts` `.actual`, `.marca` sin enlace |
| N4 | Rutas desconocidas | `**` redirige en silencio a la portada; el usuario no sabe que el enlace estaba roto | todos los `app.routes.ts` |
| N5 | Alertas | Cada alerta es un enlace a otra app: al abrirla se pierde el contexto y no hay retorno | `marco.ts` `alertas.url(a)` |
| N6 | Portal | `/facturas/$facturaId` muestra la lista completa (no la factura del correo); `CancelarServicio` usa diálogo con "Volver" pero sin resultado visible al cerrar | `rutas.tsx`, `CancelarServicio.tsx` |
| N7 | Portal, comercial | Tras elegir cliente, el único camino de regreso a la lista es el menú; no se ve en todas partes a qué cliente se está atendiendo | `Marco.tsx`, `AvisoComercial.tsx` |

### 1.2 Procesos de gestión que faltan

Hoy los datos maestros salen solo de la semilla (D12, D102). Ninguna app permite darlos de alta, editarlos ni darlos de baja:

| # | Entidad | Backend hoy | Gateway GraphQL | UI | Falta |
|---|---|---|---|---|---|
| G1 | Unidades (tracto, remolque) | `POST/PUT /unidades`, `POST /unidades/{id}/baja` **ya existen** en Flota | sin mutación | solo lista y detalle | mutaciones `crearUnidad`, `editarUnidad`, `darDeBajaUnidad` + formularios en `cc-flota` |
| G2 | Documentos de unidad (SOAT, revisión) | dentro de `PUT /unidades` | no | solo lectura | edición de vencimientos desde el detalle |
| G3 | Choferes | solo `GET /choferes` | solo query | no hay pantalla | alta, edición, habilitar/inhabilitar, licencia y vencimiento; vínculo con usuario Keycloak (`usuarioSub`) |
| G4 | Rutas | solo `GET /rutas` en Viajes | solo query | no hay pantalla | alta/edición de ruta (destino, `radioMetros`, `distanciaKm`); el evento `RutaActualizada` ya está en la propuesta |
| G5 | Tarifas | no hay endpoint en Finanzas | no | no | gestión de tarifa por ruta y tipo de carga |
| G6 | Línea de crédito | solo `GET` | solo query | solo lectura | ajustar límite, suspender/reactivar |
| G7 | Clientes (interno) | `GET/POST /clientes` | solo query | solo en el portal comercial | ficha y edición desde el Centro de Control |
| G8 | Usuarios internos y roles | Keycloak | no | no | ver sección 3, decisión pendiente |
| G9 | Mantenimientos | programar y cerrar **sí existen** | sí | sí | lista propia en `cc-flota` (hoy solo dentro del detalle de unidad) |

### 1.3 Iconografía y señales visuales

| # | Problema | Evidencia |
|---|---|---|
| I1 | Casi no hay iconos: 8 en todo el Centro de Control, ninguno en pestañas, acciones de tabla ni estados. Donde hay, el texto del botón está dentro del `mat-icon` (`<mat-icon> Exportar a Excel`) y el lector de pantalla lee el nombre del glifo | `grep mat-icon` |
| I2 | Íconos de estado sin significado: `notifications_off` para "servicio de alertas caído" se confunde con "silenciado" | `marco.ts` |
| I3 | Enums crudos en pantalla: `MANTENIMIENTO_PENDIENTE`, `EN_RUTA`, `TRACTO`, `GRANO` | 20 sitios: `unidad.ts`, `unidades.ts`, `viaje.ts`, `viajes.ts`, `facturas.ts`, `factura.ts`, `acciones.ts`, `agente.ts`, `tablero.ts`, `marco.ts` |
| I4 | Un solo `chip-estado` con dos colores (normal/alerta) para todos los estados; no distingue en curso, terminado, cancelado, vencido | `styles.css` |
| I5 | Raya lateral de color en las alertas (`border-left: 4px`) y colores fijos `#ba1a1a`, `#3c6090` en el mapa | `marco.ts:165`, `mapa.ts:72` |
| I6 | Portal: el menú marca la página actual solo con subrayado; "Salir" sin icono ni confirmación de quién es la sesión | `Marco.tsx` |

### 1.4 UI/UX tosca, cosas difíciles de encontrar

| # | Problema | Evidencia |
|---|---|---|
| U1 | Listas sin buscar, filtrar, ordenar ni paginar (solo viajes y facturas tienen algo) | `unidades.ts`, `servicios.ts`, `cotizaciones.ts`, `conduccion.ts`, `combustible.ts` |
| U2 | Detalles como pila de `<p><b>Etiqueta:</b> valor</p>` dentro de tarjetas; sin jerarquía, sin acciones agrupadas | `viaje.ts`, `unidad.ts`, `factura.ts` |
| U3 | Encabezado de página sin estructura común: título suelto, acciones donde caigan, sin subtítulo ni contador | todas las páginas |
| U4 | Estados vacíos genéricos o ausentes ("Sin …" en pocas páginas, ninguno con siguiente paso) | conteo de `@empty` |
| U5 | Estilos globales copiados 4 veces (`styles.css` idénticos de 56 líneas) en vez de vivir en `ui-comun` | `cc-*/src/styles.css` |
| U6 | Tipografía por defecto (Roboto), escala plana (`h1` headline-small, `h2` title-medium), `.secundario` a 13 px fijo | `styles.css` |
| U7 | Tablero: grilla de tarjetas iguales con cifra grande + lista (plantilla "hero metric") | `tablero.ts` |
| U8 | Formularios del Centro de Control con `FormsModule` suelto, sin validación visible por campo | `viaje.ts`, `factura.ts` |
| U9 | Sin `PRODUCT.md` ni `DESIGN.md`: no hay criterio escrito de tono, color ni componentes | raíz del repo |

## 2. Plan por fases

Cada fase es una rama `<tipo>/<pieza>/<que>` desde `develop` y un PR. Se puede parar al final de cualquier fase con algo entregable.

### Fase A. Base de diseño (sin cambios de comportamiento)

0. `fix/ui-comun/fuente-iconos` (W1): empaquetar la fuente Material Symbols desde npm en `ui-comun` y cargarla en las 4 apps.
1. `docs/repo/product-design`: escribir `PRODUCT.md` (usuarios por rol, escena física de uso, tono) y `DESIGN.md` (tokens, escala tipográfica, estados, iconos). Sale de `libs/design-tokens`.
2. `refactor/ui-comun/estilos-comunes`: mover los 4 `styles.css` a `ui-comun/src/estilos/base.css`; escala tipográfica con contraste ≥1,25; quitar 13 px fijos.
3. `feat/ui-comun/etiquetas-estado`: un mapa `enum → { texto, icono, tono }` en `ui-comun/dominio` (y su espejo en el portal) + componente `cc-estado` que reemplaza `chip-estado`. Cubre I3, I4. Prueba unitaria: todo valor del enum GraphQL tiene etiqueta.
4. `fix/ui-comun/alertas-sin-raya`: quitar el `border-left` (icono de severidad + fondo tintado) y los hex del mapa (tokens). Cubre I5.

### Fase B. Navegación (callejones sin salida)

1. `feat/ui-comun/encabezado-pagina`: componente `cc-encabezado` con migas (`Unidades › ABC-123`), botón volver a la lista padre, título, subtítulo y zona de acciones. Usarlo en **todas** las páginas de detalle (N1) y de lista (U3).
2. `feat/cc-tablero/pestanas`: `Seccion` con pestañas Tablero · Reportes · Voz · Agente filtradas por rol (N2).
3. `feat/ui-comun/barra`: marca enlaza al inicio de la app; app actual marcada con icono y peso; alerta abre con `?desde=` para ofrecer "volver a <app>" (N3, N5).
4. `feat/ui-comun/no-encontrada`: página 404 propia con enlace a la portada en las 4 apps y en el portal (N4).
5. `fix/portal-cliente/navegacion`: `/facturas/$id` resalta y abre esa factura; resultado visible tras cancelar; banda fija "Atendiendo a: <cliente> · Cambiar" en modo comercial; botón volver en `servicios/$id` y `cotizaciones/$id` (N6, N7).

### Fase C. Encontrar las cosas

1. `feat/ui-comun/tabla-lista`: envolver `mat-table` con búsqueda de texto, filtro por estado (usa las etiquetas de A3), orden por columna y paginación local; estado vacío con siguiente paso. Aplicar en unidades, servicios, cotizaciones, combustible, conducción, viajes, facturas (U1, U4).
2. `feat/ui-comun/detalle`: patrón de detalle en lista de definiciones (`<dl>`) con acciones agrupadas arriba, en lugar de párrafos en tarjetas (U2). Aplicar a viaje, unidad, factura.
3. `feat/ui-comun/iconos`: iconos en pestañas, acciones de tabla y estados; texto fuera del `mat-icon` y `aria-hidden` en el glifo; `cloud_off` para "alertas no disponibles" (I1, I2). Portal: icono y marca de página actual con fondo, no subrayado (I6).
4. `refactor/cc-tablero/tablero`: reemplazar la grilla de tarjetas iguales por una lectura priorizada (lo que pide acción primero: riesgo, alertas, mora; luego cifras) (U7).

### Fase D. Procesos de gestión (requiere decisiones, sección 3)

Orden por valor y por lo que ya existe en el backend. Cada paso sigue "contratos primero": OpenAPI/GraphQL en `contratos/` en el mismo commit.

1. `feat/gateway/gestion-unidades` + `feat/cc-flota/gestion-unidades`: mutaciones sobre los endpoints que Flota ya tiene; formulario alta/edición con validación por campo; baja con confirmación en línea y motivo (G1, G2). Idempotency-Key en alta y baja.
2. `feat/cc-flota/mantenimientos`: pestaña propia con la query `mantenimientos` existente (G9).
3. `feat/flota/gestion-choferes` → gateway → `cc-flota`: alta, edición, habilitar/inhabilitar, vencimiento de licencia (G3). Nuevo evento si Viajes necesita la copia.
4. `feat/viajes/gestion-rutas` y `feat/finanzas/gestion-tarifas` → gateway → nuevas pestañas "Rutas" en `cc-operaciones` y "Tarifas" en `cc-finanzas` (G4, G5). `RutaActualizada` por Outbox.
5. `feat/finanzas/ajuste-linea-credito` → gateway → `cc-finanzas` (G6).
6. `feat/cc-operaciones/clientes`: lista y ficha de clientes internas con lo que ya da la query `clientes` (G7).
7. Usuarios internos (G8): según la decisión de la sección 3.

**Estado al 31-10-2026 (sin tocar backend, decisión 1 de la sección 3).** Hecho en el front: G9 pestaña Mantenimientos en `cc-flota` (lista con búsqueda, filtro y orden; enlace a la unidad, donde se programa y se cierra); G3 pestaña Choferes con ficha `choferes/:id` (licencia con aviso de vencimiento, estado, conducción de la semana), armada desde la lista porque no hay `chofer(id)`; G1 y G2 lista y ficha de unidades con aviso de documentos vencidos o por vencer; G7 pestaña Clientes con ficha `clientes/:id` (línea de crédito, últimos 50 servicios con enlace al viaje, "Ver como cliente" para comercial); G4 pestaña Rutas con ficha `rutas/:id` (origen, destino, distancia; `radioMetros` no está en el esquema); G6 pestaña Líneas de crédito en `cc-finanzas` (límite, reservado, utilizado, disponible y estado, con `clientes { lineaCredito }`); filtro por estado en Servicios (se pide a Viajes). Pendiente de backend, con el contrato propuesto en `specs/pendientes-frontend-web.md` sección 5: pasos 1, 3, 4 y 5 (alta, edición y baja de unidades; alta, edición y habilitación de choferes; alta y edición de rutas; tarifas; ajuste de línea de crédito), la edición de clientes y el permiso `realm-management` del gerente para G8.

### Fase E. Pulido y verificación

1. Formularios del Centro de Control a `ReactiveForms` con errores por campo (U8).
2. Auditoría con `impeccable audit` por app, a11y con axe (teclado, foco, contraste AA, objetivos táctiles ≥44 px) y vista a 375 px.
3. Anotar para la documentación ICONIX los nuevos casos de uso de gestión (sin tocar `.docx` ni `.eap`).

**Estado al 31-10-2026.** Hecho: (1) los formularios del Centro de Control pasan a `ReactiveForms` (registrar pago, programar y cerrar mantenimiento, aprobar o rechazar entrega, resolver intervención, aprobar o rechazar crédito, aprobar o rechazar acción del agente, cancelar servicio, parámetros de reporte, pregunta por voz), con `mat-error` por campo, botón siempre activo y foco en el primer campo con error (W4); el foco vuelve al botón que abrió el formulario; los montos se validan como texto decimal. (2) Un solo mapa `codigo → frase` en `ui-comun/dominio/src/errores.ts` y su espejo en `portal-cliente/src/compartido/ui/Problema.tsx`; ningún `message` ni `detail` del servidor llega a la pantalla; `cc-aviso-servicios` y `Problema` ofrecen «Reintentar». (3) `cc-confirmacion` con resumen antes de registrar un pago, rechazar una entrega, cerrar un mantenimiento y rechazar una acción; la cancelación de servicio ya confirmaba y ahora dice qué libera. (4) Esqueleto de carga en listas y fichas (`cc-esqueleto`, `cc-pie-lista [cargando]`; portal `Cargando`). (5) Revisión A-1: la fuente de íconos baja de 4 001 276 a 12 960 bytes (85 glifos, outlined 400, WOFF) con `scripts/iconos.mjs`; `npm run probar` falla con un ícono fuera de la lista; los íconos se ocultan hasta que carga la fuente. (6) Foco visible, objetivos de 44 px en táctil, sin `opacity` en textos, tablas que se desplazan dentro de su caja, `prefers-reduced-motion`; contraste AA comprobado con los tokens en claro y oscuro. Queda para la revisión: la auditoría con axe en el navegador (no hay backend en local) y la vista a 375 px de cada página con datos reales.

## Para ICONIX

Lo que cambia la documentación ICONIX (casos de uso, robustez, secuencia y prototipos de pantalla) por las fases A a E. No se tocan los `.docx` ni los `.eap`: esta lista es la entrada para actualizarlos.

**Casos de uso nuevos (solo lectura, con lo que el Gateway ya da):**

| Caso de uso | Actor | App y pantalla | Notas para el diagrama de robustez |
|---|---|---|---|
| Consultar mantenimientos de la flota | jefe_flota, gerente | `cc-flota` › Mantenimientos (lista) | Lista con búsqueda, filtro por estado y orden; enlaza a la ficha de la unidad, donde siguen «Programar» y «Cerrar» |
| Consultar choferes | jefe_flota, gerente | `cc-flota` › Choferes (lista y ficha `choferes/:id`) | Licencia con aviso de vencimiento y conducción de la semana. La ficha se arma desde la lista (no hay `chofer(id)`) |
| Consultar clientes | comercial, despachador, gerente | `cc-operaciones` › Clientes (lista y ficha `clientes/:id`) | Línea de crédito y últimos servicios; «Ver como cliente» abre el portal (extiende el CU de atención comercial) |
| Consultar rutas | despachador, gerente | `cc-operaciones` › Rutas (lista y ficha `rutas/:id`) | Origen, destino y distancia |
| Consultar líneas de crédito | administracion, gerente | `cc-finanzas` › Líneas de crédito | Límite, reservado, utilizado, disponible y estado (al día, sin disponible, en mora) |
| Administrar usuarios internos | gerente | Menú de usuario › consola de Keycloak | Sin pantalla propia (decisión 2); actor externo: Keycloak |

**Casos de uso propuestos, pendientes de backend** (sin botón en pantalla; contrato en `specs/pendientes-frontend-web.md` §5): dar de alta, editar y dar de baja una unidad; editar documentos de una unidad; dar de alta, editar e (in)habilitar un chofer; dar de alta y editar una ruta; ajustar, suspender y reactivar una línea de crédito; editar un cliente; gestionar tarifas.

**Cambios en casos de uso existentes:**

- Registrar pago (spec 008), cancelar servicio (spec 004), decidir entrega observada (rechazo, spec 007), cerrar mantenimiento (spec 010), decidir acción del agente (rechazo, spec 014) y decidir crédito (rechazo, spec 012): nuevo paso «el sistema muestra un resumen de lo que va a pasar; el usuario confirma o vuelve» antes de llamar al Gateway. En robustez, un objeto de interfaz «Confirmación» entre el formulario y el controlador.
- Todos los formularios: flujo alterno «datos inválidos: el sistema marca cada campo con su mensaje y enfoca el primero; el usuario corrige». Reemplaza al botón deshabilitado.
- Todo caso de uso que consulta: flujo alterno «un servicio no responde: el sistema dice cuál y ofrece Reintentar»; los mensajes de error salen del `codigo` (000 §5).

**Pantallas nuevas o cambiadas (prototipos):** pestañas de `cc-tablero` (Tablero, Reportes, Pregunta por voz, Agente), encabezado común con migas y «volver», página «No encontrada» en las 4 apps y el portal, tablero priorizado («Pide acción» primero), listas con búsqueda, filtro, orden y paginación, fichas en lista de definiciones, y las pestañas de gestión de la tabla de arriba.

## 3. Decisiones (respondidas el 31-10-2026)

1. **Gestión de datos maestros: sí va.** Regla de esta iteración: **no se toca backend** (`servicios/`, gateway, `contratos/`). Por eso en el front se construye toda la gestión que el gateway ya permite (listas y fichas de unidades, mantenimientos, choferes, rutas, clientes, líneas de crédito) y las acciones de escritura que faltan en el gateway (alta/edición/baja de unidades, choferes, rutas, ajuste de línea de crédito) quedan como **pendientes de backend** en `specs/pendientes-frontend-web.md`, con el contrato propuesto. En pantalla no se muestran botones muertos.
2. **Usuarios internos (G8):** enlace a la consola de administración de Keycloak (menú de usuario, solo para gerente). Sin pantalla propia.
3. **Tarifas (G5):** pendiente. Queda como tarea en `specs/pendientes-frontend-web.md`; cuando el backend la agregue se hace la pantalla en `cc-finanzas`.

Además se suman de `specs/pendientes-frontend-web.md`: **W1** (las 4 apps no cargan la fuente de iconos: los `mat-icon` salen como texto) a la Fase A, **W3** (404 de predicción = "aún sin datos") a la Fase B y **W4** (botones deshabilitados sin explicación) a la Fase E. W2 es backend: fuera.

## 3.1 Flujo de trabajo

Una sola rama `feat/ui-comun/arreglos-ux-web` (desde `develop`), un commit por fase. Al cerrar cada fase: un subagente la revisa y escribe `specs/revisiones/web-fase-<X>.md`; otro avanza la fase siguiente. Los informes forman una cola que se implementa después de las fases, en al menos 3 vueltas de revisión.

## 4. Orden recomendado

A → B → C se pueden hacer sin tocar backend ni decisiones y resuelven todas las quejas de navegación, iconos y "no se encuentran las cosas". D empieza por D1 y D2 (el backend ya existe) mientras se decide el resto.
