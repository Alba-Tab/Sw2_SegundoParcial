# Revisión Fase B (navegación): commit 2b80203

Alcance: solo el commit `2b80203` (`feat(ui-comun): agrega encabezado con migas y volver, pestañas del tablero y página 404`), leído con `git show`. No se corrieron builds ni pruebas. Las líneas son las del archivo en ese commit.

## Qué está bien

- Las 23 páginas usan el mismo encabezado: `cc-encabezado` en las 4 apps; en el portal, `h2` dentro del marco, que ya tiene su `h1`. Cada página Angular tiene un solo `h1` (`cc-encabezado`, `NoEncontrada`, `SinAcceso`; la marca de la barra es un `<a>`).
- Cada página de detalle tiene migas y «volver», también mientras carga o si falla: `viaje`, `unidad`, `factura`, `acciones/:id`, `combustible/:id`, y en el portal `servicios/$id` y `cotizaciones/$id` (con `conVolver`).
- `?desde=` está bien validado: `appOrigen` solo acepta claves de `NOMBRES_APPS` con `Object.hasOwn`, distintas de la app actual, y el enlace sale de `config.urls`. No hay redirección abierta. El texto es «Volver a <nombre de la app>».
- La 404 no rompe nada de lo que preocupaba:
  - La vuelta de Keycloak la procesa `Sesion.iniciar` antes del router (`replaceState` a `state`).
  - `sin-acceso` está declarada antes de `**`.
  - En cc-tablero, `entrada` solo redirige con `url === '/'` en la primera entrada; la marca y «Ir al inicio» van a `/` después de esa primera vez.
  - En el portal, `notFoundComponent` sale en la raíz y `inicio` conserva `hasAuthParams()`.
- La URL de la consola (`<base>/admin/<realm>/console/`) es la correcta para Keycloak 19+ (Quarkus). El enlace solo se muestra al gerente.
- Accesibilidad de las migas: `nav` con `aria-label`, `ol`, separador CSS con texto alternativo vacío, `aria-current="page"` y objetivos de 44 px. El botón de volver es `mat-icon-button`, con `aria-label` «Volver a <lista>» y 48 px.

## Hallazgos

| id | sev. | archivo:línea | problema | arreglo concreto |
|---|---|---|---|---|
| B-1 | P1 | `cc-operaciones/src/app/viajes/ui/viaje.ts:44`, `:75`, `:162`; `ui-comun/src/lib/errores.ts:58` | W3 esconde las fallas reales. El Gateway ya convierte el 404 de la predicción en `null` (`servicios/gateway/src/graphql/cargadores.ts:46`, `nuloSi404`). Por eso, si `riesgo` llega con error, es una falla real: Analítica caída o `ERROR_INTERNO`. Pero `sinErroresDe(r?.error, 'riesgo')` borra todos esos errores, `campos` ya no tiene `riesgo: 'Analítica'` y la tarjeta dice «Aún no hay datos para estimar el retraso». El despachador lee «todavía no hay datos» cuando en realidad el servicio está caído. | Quitar `sinErroresDe` y volver a poner `riesgo: 'Analítica'` en `campos`. Pasar `r?.error` sin filtrar. La tarjeta muestra «Aún no hay datos…» solo con `v.riesgo === null` y sin error en el path `riesgo` (ver con `servicioCaido(r?.error, 'riesgo')` o el codigo). Con error dice «Riesgo no disponible: Analítica no responde». Si se quiere conservar `sinErroresDe`, que filtre solo `extensions.codigo === 'NO_ENCONTRADO'`. |
| B-2 | P2 | `portal-cliente/src/features/servicios/PaginaServicio.tsx:66-69` | Roba el foco. El `ref` es una función nueva en cada render, así que React la vuelve a llamar en cada render y `n.focus()` se repite mientras `recienCancelado` sea `true`. Cualquier render posterior (`rutas` que resuelve, una nueva consulta al volver a la pestaña, el `Pod`) devuelve el foco a la alerta aunque el usuario ya esté en otro control. | Enfocar una sola vez: `useEffect(() => { if (recienCancelado) alertaRef.current?.focus(); }, [recienCancelado])` con `useRef`. O usar la misma guarda `enfocada` que `PaginaFacturas`. Poner `tabIndex={-1}` solo cuando `recienCancelado`. |
| B-3 | P2 | `portal-cliente/src/features/facturas/PaginaFacturas.tsx:115`, `:171` | Callejón sin salida: si la factura del correo está en una página que todavía no se cargó (`hasNextPage`), no se resalta nada ni se avisa. El aviso «No encontramos la factura…» solo sale cuando ya no hay más páginas. El usuario ve una lista sin la factura del enlace. | Mientras `elegida` no esté en `datos` y haya `hasNextPage`, pedir `fetchNextPage()` en un `useEffect` con un tope de páginas. Si no, avisar: «La factura del enlace está más abajo: Cargar más». Agregar la prueba de ese caso. |
| B-4 | P2 | `portal-cliente/src/compartido/ui/Marco.tsx:61-94` | En modo comercial, la barra fija junta la `AppBar`, que en móvil ocupa dos líneas por el `flexWrap`, y el `Alert` de dos líneas con un botón de 44 px. A 375 px eso puede pasar de 200 px fijos, más de un cuarto de la pantalla, y tapa formularios y tablas. | Fijar todo solo desde `md` (`position: { xs: 'static', md: 'sticky' }`). O, en `xs`, dejar fija solo una línea compacta «Atendiendo a: X · Cambiar» y ocultar la segunda línea. Verificar a 375 px (Fase E). |
| B-5 | P2 | `ui-comun/src/lib/navegacion.spec.ts`; `cc-operaciones/.../viaje.ts` (sin spec) | Faltan pruebas de lo más delicado: (a) la tarjeta de riesgo del viaje, con `null`, con error y con dato (B-1 habría salido ahí); (b) que el `<a>` de «Administrar usuarios» se renderiza con `target="_blank"` y `rel`, porque hoy solo se prueba el `computed`; (c) que `Alertas.url()` agrega `desde` (solo se prueba `conDesde`); (d) en cc-tablero, que la marca o `/` no vuelve a disparar `entrada` después de la primera entrada. | Agregar `viaje.spec.ts` con los 3 casos de riesgo. En `navegacion.spec.ts`, abrir el menú de usuario y comprobar el `href`, `target` y `rel` del enlace. Agregar un caso de `Alertas.url` con `config.app`. Agregar un caso de `debeRedirigir` con `yaEntro: true` y la URL `/`. |
| B-6 | P3 | `ui-comun/src/lib/marco.ts:124` | El enlace a la consola lleva `rel="noopener"` sin `noreferrer`, y la revisión pedía los dos. Hoy `target="_blank"` ya implica `noopener`, pero sin `noreferrer` la consola recibe la URL de la página de origen. | `rel="noopener noreferrer"`. |
| B-7 | P3 | `ui-comun/src/lib/encabezado.ts:19` | «Volver a <app>» lleva a la raíz de la app de origen (`config.urls[o]`), no a la página donde se abrió la alerta, así que se pierde el contexto que pedía N5. Es aceptable para esta fase, pero conviene anotarlo. | Si se quiere volver a la misma página: `?desde=<app>&ruta=<path>`, aceptando solo un `path` relativo que empiece con `/` y no con `//`, y concatenarlo a `config.urls[o]`. Si no, dejarlo anotado en la spec como decisión. |
| B-8 | P3 | `cc-operaciones/.../viaje.ts:44` | Al llamar `sinErroresDe(...)` en la plantilla se crea un `CombinedGraphQLErrors` nuevo en cada detección de cambios, y `cc-aviso-servicios` recibe un input distinto cada vez. | Si se mantiene después de B-1, pasarlo a un `computed` en la clase. |
| B-9 | P3 | `cc-flota/.../combustible.ts:13-15`; `cc-operaciones/.../acciones.ts:34-35` | Las migas no coinciden con lo que se ve. En combustible, el `h1` dice «Combustible», pero la última miga (`aria-current`) dice «Carga marcada». En acciones, la miga padre dice «Acciones del agente» y el `h1` de la lista, «Acciones propuestas por el agente». | Con `id()`, poner el título «Carga marcada» o dejar la miga igual al `h1`. Usar el mismo texto en la pestaña, la miga y el `h1` de acciones. |
| B-10 | P3 | `ui-comun/src/lib/marco.ts:59`, `:63` | La marca y el botón de la app actual son dos enlaces seguidos al mismo `/`: el lector de pantalla oye dos enlaces con el mismo destino. | Dejar la app actual como `<span aria-current="page">` con el mismo estilo, o quitarle el `routerLink` y dejar solo la marca. |

Conteo: P0 0 · P1 1 · P2 4 · P3 5.

## Fuera de la Fase B

- **G8, permisos en Keycloak (plataforma, no frontend):** en `plataforma/keycloak/realm-transporte.json` y `usuarios-semilla.json`, el rol `gerente` no tiene roles de `realm-management` (`view-users`, `manage-users`, `query-groups`). El enlace abre la consola, pero el gerente llega a una pantalla de «sin permisos»: es un callejón sin salida que el frontend no puede resolver. Hay que agregar ese compuesto al rol `gerente` en el realm, o documentar que la gestión la hace un administrador del realm. Hay que decidirlo antes de la demo.
- La página 404 del portal usa `h2` porque el marco tiene el `h1` «Transporte de carga». Así funciona todo el portal y no es de esta fase; si en la Fase E se cambia a un `h1` por página, va en todas a la vez.

## Estado vuelta 1

| id | estado | nota |
|---|---|---|
| B-1 | hecho | El aviso recibe el error sin filtrar y `riesgo: 'Analítica'`; con error en `riesgo` la tarjeta dice «Riesgo no disponible: Analítica no responde» |
| B-2 | hecho | `useRef` + `useEffect`: el foco va a la alerta una sola vez; `tabIndex` solo tras cancelar |
| B-3 | hecho | Si la factura del enlace no está, se piden hasta 5 páginas solas; después, aviso «está más abajo: usa Ver más». Con prueba |
| B-4 | hecho | Barra y banda fijas solo desde `md`; en móvil, estáticas. Sin comprobar en el navegador a 375 px |
| B-5 | hecho | `viaje.spec.ts` (null, error, dato), enlace de «Administrar usuarios» con `target` y `rel`, `Alertas.url` con `?desde=`. El caso `yaEntro: true` con `/` ya estaba en `entrada.spec.ts` |
| B-6 | hecho | `rel="noopener noreferrer"` en la consola y en «Ver como cliente» |
| B-7 | descartado | Decisión de esta iteración: vuelve a la raíz de la app; anotado en `pendientes-frontend-web.md` §5 con la opción `?ruta=` |
| B-8 | hecho | Se va con B-1: la plantilla ya no llama a `sinErroresDe` |
| B-9 | hecho | Combustible: el `h1` dice «Carga marcada» con `id`; Acciones: pestaña, miga y `h1` dicen «Acciones del agente» |
| B-10 | hecho | La app actual es un `span` con `aria-current`; solo la marca enlaza a `/` |
| G8 (fuera) | pendiente backend | Compuesto `realm-management` del rol `gerente` en el realm: plataforma, ya en §5 |

Conteo: hecho 9 · ya resuelto en E 0 · pendiente backend 1 (G8, fuera de la tabla) · descartado 1.
