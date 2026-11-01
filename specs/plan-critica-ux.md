# Plan de correcciones: crítica de UX/UI en el navegador

Fecha: 01-11-2026. Rama `feat/ui-comun/arreglos-ux-web` (HEAD `c2fa9fb`), servida en local en 4201–4204 y 5173 con datos de semilla y sesión de `gerente1`. Método: comando `critique` de impeccable con dos evaluaciones independientes (revisión de diseño en el navegador y detector automático), cruzadas y verificadas en el código. Contexto: `PRODUCT.md` (registro producto) y `DESIGN.md`.

Límites: solo se vio el rol gerente. El portal con sesión de cliente, los formularios de pago, entrega y confirmación (no había datos o el gerente no tiene permiso) y FCP/LCP (pestaña en segundo plano) quedan sin ver. Las medidas de carga son del servidor de desarrollo.

## 1. Resultado

**Salud del diseño (Nielsen): 23/40, aceptable.**

| # | Heurística | Nota | Problema principal |
|---|---|---|---|
| 1 | Estado del sistema | 2 | Pantalla en blanco durante el ida y vuelta a Keycloak; «0 viajes» mientras carga; un sondeo fallido vacía la tabla |
| 2 | Lenguaje del usuario | 2 | Números en formato inglés («1,300 km»), «−22 días», «Puntaje 0.65» sin escala, JSON en Agente |
| 3 | Control y libertad | 3 | Migas, volver y 404 bien; el gerente en el portal cae en «Completa los datos de tu empresa» |
| 4 | Consistencia | 2 | La misma factura con dos vencimientos; el portal sin Roboto; enlaces con el color del navegador |
| 5 | Prevención de errores | 2 | Una cuenta interna puede dar de alta una empresa cliente |
| 6 | Reconocer, no recordar | 3 | Operaciones con 8 pestañas; la unidad bloqueada no dice qué falta ni quién la libera |
| 7 | Flexibilidad | 2 | Sin «saltar al contenido», sin atajos; cada cambio de app recarga y repite el login |
| 8 | Minimalismo | 3 | JSON del Agente, Reportes vacío al abrir, pestañas estiradas |
| 9 | Recuperación de errores | 2 | «Viajes no disponible» en vez de lo que el usuario buscaba; «no encontrado» ofrece «Reintentar» |
| 10 | Ayuda | 2 | Subtítulos que guían en algunas páginas; nada más |

**Anti-patrones:** no parece hecho por IA. Material 3 sobrio, sin degradados, glass, rayas laterales ni cifras gigantes. El riesgo es el contrario: azul corporativo de la categoría y poco carácter. El detector automático solo marcó Roboto (convención de Material, se acepta), la barra inferior de la app actual (intencional, se acepta) y una palabra huérfana en la bienvenida del portal.

**Carga cognitiva:** moderada (3 de 8 puntos fallan: demasiadas opciones en Operaciones y Reportes, datos que cambian entre pantallas, Agente sin revelación progresiva).

**Lo que funciona y no se toca:** el bloque «Pide acción» del tablero; el patrón de lista común (migas, filtros en la URL, contador, esqueleto, «Sin dato», chips con texto + ícono + tono); montos en BOB, fechas de La Paz y la 404 con salida; contraste en claro (ningún texto bajo 6,46:1) y foco visible de 2 px.

## 2. Correcciones solo de frontend (se pueden hacer ya)

Prioridad: P1 rompe confianza o accesibilidad; P2 estorba el trabajo diario; P3 pulido.

### Contraste y accesibilidad
| Id | Pri | Dónde | Problema | Corrección |
|---|---|---|---|---|
| CA-1 | P1 | `ui-comun/src/estilos/base.css` | Los enlaces usan el azul del navegador: **1,98:1 en oscuro** (primeras columnas de las tablas invisibles) | `a, a:visited { color: var(--mat-sys-primary) }`, subrayado y foco con token |
| CA-2 | P2 | `base.css` y portal | `color-scheme` sin declarar: fechas y barras de scroll claras en tema oscuro | `:root { color-scheme: light dark }` y su par en `data-tema` |
| CA-3 | P2 | `ui-comun/src/lib/marco.ts` | 7 paradas de tabulación antes del contenido | Enlace «Saltar al contenido» hacia `<main id="contenido">` |
| CA-4 | P2 | `marco.ts` (alertas) | El detalle de cada alerta va en 12 px y es texto con el que se decide | `body-medium` (DESIGN.md: 12 px nunca para decidir) |
| CA-5 | P2 | tablas, 375 px | Encabezados de orden de 20 px de alto; toggles de periodo y campana de 40 px | Mínimo 44 px en táctil (`@media (pointer: coarse)`) |
| CA-6 | P2 | `cc-operaciones/.../mapa.ts` | Mapa con `role="application"` sin alternativa en texto | Lista de viajes con posición debajo o al lado del mapa |
| CA-7 | P2 | portal `compartido/ui/Marco.tsx` | Sin `<main>`; el `h1` es la marca en todas las páginas y el título real es `h2` | `<main>`, marca sin encabezado y `h1` por página |

### Jerarquía visual y reglas de diseño
| Id | Pri | Dónde | Problema | Corrección |
|---|---|---|---|---|
| JV-1 | P2 | `cc-flota/.../unidades` | La unidad bloqueada queda última (orden por placa); los km cercanos al mantenimiento solo en rojo | Orden inicial por estado (lo que no puede salir primero) e ícono además del color |
| JV-2 | P2 | `cc-finanzas/.../facturas` | Una factura vencida se muestra «Por cobrar» en tono info; lo vencido es solo el color de la fecha | Chip «Vencida hace N días», tono error, ícono `event_busy`, en la lista y en el encabezado de la ficha |
| JV-3 | P2 | `cc-tablero/.../agente` | JSON crudo, nombres `snake_case`, UUID y «Conclusión: FIN» | Resumen en frases; el detalle técnico detrás de «Ver detalle técnico» |
| JV-4 | P3 | `Seccion` de las 4 apps | Pestañas estiradas a 300–370 px cada una | `mat-stretch-tabs="false"`, alineadas a la izquierda |
| JV-5 | P3 | `cc-tablero/.../reportes` | Abre con 5 botones y un lienzo vacío | Abrir el reporte más usado o un estado vacío que diga qué elegir |
| JV-6 | P3 | tablero | «Viajes en curso 1» junto a «En viaje 2» confunde (tracto y remolque) | Aclarar «2 unidades (tracto y remolque)» |
| JV-7 | P3 | portal | Sin `@font-face`: Helvetica en Mac, Arial en Windows; Centro de Control en Roboto | Empaquetar Roboto desde npm como en el Centro de Control |
| JV-8 | P3 | `portal-cliente/.../Bienvenida.tsx:21` | «crédito.» sola en la última línea | `text-wrap: pretty` en párrafos y `balance` en títulos |

### Feedback
| Id | Pri | Dónde | Problema | Corrección |
|---|---|---|---|---|
| FB-1 | P1 | `viajes.ts:79`, `entregas.ts:106`, `intervenciones.ts:102` (y el resto de listas con sondeo) | Un sondeo fallido vacía una tabla que ya tenía datos | Conservar las últimas filas buenas, aviso arriba con «Datos al …» y «Reintentar» |
| FB-2 | P1 | ficha de unidad (alerta 1111AAA) | «No encontrado» usa `cloud_off` (servicio caído) y ofrece «Reintentar» | Ícono propio (`search_off`), texto «No encontramos esta unidad» y solo «Volver» |
| FB-3 | P2 | `index.html` de las 4 apps | Pantalla en blanco mientras va y vuelve de Keycloak | Indicador estático dentro de `<app-root>`: «Abriendo Operaciones…» |
| FB-4 | P2 | contador de listas | «0 viajes» mientras carga | «Cargando…» hasta la primera respuesta |
| FB-5 | P2 | `mapa.ts:40-44` | Mapa vacío sin mensaje | «Ningún viaje en ruta reporta posición ahora» |
| FB-6 | P2 | ficha de cliente y avisos de servicio | «Viajes no disponible» nombra el servicio, no lo buscado | «No se pudieron cargar los viajes de este cliente» |
| FB-7 | P3 | tablero | «Datos al …» viejo sin aviso | Marcar en tono aviso si tiene más de N minutos |

### Responsive
| Id | Pri | Dónde | Problema | Corrección |
|---|---|---|---|---|
| RS-1 | P1 | `ui-comun/src/lib/marco.ts` | A 375 px la página mide 495–545 px: campana y menú de usuario (con «Cerrar sesión») fuera de pantalla; a 800 px los enlaces se cortan por arriba y «Finanzas» cae a otra fila | Bajo ~900 px, las apps en un menú «Apps» (ícono `apps`) y el usuario solo con ícono; sin desborde horizontal a 375 px |
| RS-2 | P2 | tablas | A 375 px el estado queda fuera de pantalla; «FAC-000001» se parte | Estado como segunda columna en angosto (o filas apiladas) y `white-space: nowrap` en identificadores |

### Alineación con el negocio
| Id | Pri | Dónde | Problema | Corrección |
|---|---|---|---|---|
| NG-1 | P1 | 57 usos de `\| number` en `cc-flota` y `cc-operaciones` | Números en formato inglés: «1,300 km» se lee 1,3 km en Bolivia | Pipe `numero` en `ui-comun` con `Intl.NumberFormat('es-BO')` (como `bob`) o `LOCALE_ID` `es-BO` con `registerLocaleData`; prueba |
| NG-2 | P1 | reporte «Cuentas por cobrar» (`reportes.ts`, `tabla-reporte.ts`) | Abre con la semana y esconde la mora (10.400 frente a 15.400 del tablero) | Incluir siempre lo vencido, separar vencido y por vencer con tono, enlazar cada factura, «BOB» en el encabezado |
| NG-3 | P2 | `cc-tablero/.../tablero.ts:141` | Promete «se marcan atendidas desde la campana», pero el gerente no puede | Texto según rol |
| NG-4 | P2 | ficha de unidad | No dice por qué está bloqueada ni quién la libera; el gerente no ve «Programar» sin explicación | «Bloqueada: supera N km desde el último mantenimiento. La programa el jefe de flota.» |
| NG-5 | P3 | conducción, combustible | «Puntaje 0.65» sin escala; anomalías sin severidad | Escala explícita (0 a 100 o «bueno/regular/malo») y columna de severidad |

### Flujos y arquitectura de información
| Id | Pri | Dónde | Problema | Corrección |
|---|---|---|---|---|
| FL-1 | P2 | fichas | Fichas sin enlaces entre sí: unidad y chofer del viaje en texto plano; facturas de Cuentas por cobrar y anomalías de combustible sin enlace | Enlaces entre apps con `?desde=` |
| FL-2 | P2 | Clientes (Operaciones) y Líneas de crédito (Finanzas); Cuentas por cobrar en Finanzas y en Reportes | Datos duplicados en dos apps, con fuentes que ya no coinciden | Una dueña por dato (crédito y cobranza: Finanzas); la otra pantalla resume y enlaza |
| FL-3 | P2 | Operaciones (8 pestañas) | Más de 4 opciones en la navegación de sección | Agrupar: «En ruta» (Viajes, Mapa), «Decisiones» (Entregas observadas, Intervenciones, Acciones del agente), «Datos» (Servicios, Clientes, Rutas) |
| FL-4 | P3 | Flota | La pestaña «Conducción» abre «Puntaje de conducción» | Mismo nombre en pestaña y título |

## 3. Correcciones que necesitan backend o plataforma (pendientes)

Fuera de esta iteración por la regla «no tocar backend». Se agregan a `specs/pendientes-frontend-web.md` §5.

| Id | Pri | Dónde | Problema | Corrección propuesta |
|---|---|---|---|---|
| PB-1 | P1 | `plataforma/keycloak/realm-transporte.json`, cliente `portal-cliente` | `fullScopeAllowed: false` y `scopeMappings` solo `cliente`, `comercial`: el rol `gerente` no llega al token del portal. El front no puede distinguir a un gerente de un cliente recién registrado (los dos llegan sin roles), así que la pantalla «Esta cuenta es del Centro de Control» (`c2fa9fb`) no se activa y el gerente ve «Completa los datos de tu empresa» | Agregar los roles internos al scope del portal; con eso el front ya hace lo correcto. Además, que `CuentaInterna` enlace al Tablero |
| PB-2 | P1 | `servicios/analitica` | La misma factura vence un día antes en Cobranza y Reportes que en Facturas y Tablero (10/10 frente a 11/10; −22 frente a 21 días). Probable conversión UTC | `venceEl` como `YYYY-MM-DD` en America/La_Paz y prueba que compare ambas fuentes |
| PB-3 | P2 | datos de semilla / emisor de alertas | La única alerta abierta apunta a una unidad (1111AAA) que no existe en Flota | Corregir la semilla o el emisor |
| PB-4 | P2 | gateway / Viajes | Viajes corta a menudo en el límite de 3 s del gateway, y la lista aparece y desaparece | Revisar el tiempo del servicio; el front ya queda cubierto con FB-1 |

## 4. Rendimiento y arquitectura (decisión, no arreglo inmediato)

- **Medido (dev):** TTFB 45–115 ms, DOMContentLoaded 68–547 ms, consultas GraphQL 20–306 ms con el backend sano. Fuentes bien: Roboto 42 KB y Material Symbols recortada 13 KB.
- **Lo que no cambia en producción:** cada app descarga su propio Angular y Material (4 veces con caché fría); cada carga arranca la app dos veces por el redirect de OIDC; más de 1 200 peticiones en 10 minutos por el sondeo de muchas consultas y `salud.json` de las otras apps cada 60 s.
- **Propuesta:** FB-3 ya oculta la pantalla en blanco. Para lo demás: subir el intervalo de sondeo de lo que no es tiempo real, pausar el sondeo con la pestaña oculta (`document.visibilityState`) y medir el build de producción (`ng build`, tamaño por app) antes de decidir nada mayor. Cambiar a un shell único va contra la decisión de 4 apps separadas sin federación (AGENTS.md); no se propone.

## 5. Reglas de diseño que salen de esta crítica (agregar a DESIGN.md)

1. **Números:** todo número visible pasa por un formateador `es-BO` (miles con punto, decimales con coma). Nunca el pipe `number` sin locale.
2. **Enlaces:** color de token (`primary`) en claro y oscuro, con subrayado; nunca el color del navegador.
3. **Tres estados de error distintos:** servicio caído (`cloud_off` + «Reintentar»), no encontrado (`search_off` + «Volver») y sin permiso (`lock` + quién puede hacerlo). Cada uno con su ícono y su salida.
4. **Datos ya mostrados no desaparecen por un fallo:** se conservan y se marcan como viejos.
5. **Lo bloqueado dice por qué y quién lo resuelve.**
6. **Un dato, una dueña:** si aparece en dos apps, una es la fuente y la otra enlaza.
7. **Ancho mínimo 375 px sin desborde horizontal**; la barra común se pliega bajo ~900 px.
8. **Navegación de sección con 6 opciones como máximo**; si hay más, se agrupan.

## 6. Orden propuesto

1. **Vuelta A (P1 de front):** CA-1, NG-1, RS-1, FB-1, FB-2, NG-2, JV-2. Son los que rompen la lectura o la confianza.
2. **Vuelta B (P2):** CA-2 a CA-7, JV-1, JV-3, FB-3 a FB-6, RS-2, NG-3, NG-4, FL-1 a FL-3.
3. **Vuelta C (P3 y reglas):** el resto y la sección 5 en `DESIGN.md`.
4. **Pendientes de plataforma y backend:** PB-1 a PB-4 en `specs/pendientes-frontend-web.md` §5. PB-1 es el más urgente.
5. **Verificación:** recorrer de nuevo en el navegador como gerente, y pedir sesión de `agroexport` (cliente) y de `despachador1` para ver lo que hoy quedó sin revisar.
