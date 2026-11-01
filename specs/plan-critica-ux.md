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

## 3. Backend y plataforma (ahora sí se tocan; ninguna cambia contratos)

Revisado y aprobado con cambios por un agente revisor el 01-11-2026. **Ningún contrato cambia** (`venceEl` de `FacturaEmitida` ya es `Fecha` en La Paz; no se toca).

| Id | Pri | Causa real | Pasos aprobados | Rama |
|---|---|---|---|---|
| PB-1 | P1 seguridad | El token del portal solo trae `cliente`/`comercial`; un gerente llega sin roles, el portal le pide su empresa y Viajes **no** aplica `SIN_ALTA` (`AltaDeCliente.java:31,83`): se crea un `Cliente` con su `sub` y Finanzas le abre línea. Agregar `gerente`/`administracion` al scope del portal daría lectura total desde un cliente público (`VEN_TODAS` en Finanzas): rechazado | 1) Rol de realm `interno` sin permisos, hijo compuesto de `gerente`, `despachador`, `jefe_flota`, `administracion`, `chofer`; `scopeMappings` de `portal-cliente` agrega **solo** `interno`. 2) Viajes: `interno` en `SIN_ALTA` + prueba (token `["interno"]` → `POST /clientes` 403 `SIN_PERMISO`). 3) Portal: `interno` en `ROLES_INTERNOS` + prueba (en la rama de front). 4) `probar-realm.sh`: token de ejemplo de `portal-cliente` para gerente1 (`interno`), agroexport (`cliente`), comercial1 (`comercial`). 5) README de Keycloak y spec 001 | `fix/plataforma/rol-interno-portal` (desde `develop`) |
| PB-2 | P1 | No es UTC: Finanzas reescribe `vence_el` al recargar la semilla (`CargarSemilla.php:51-56`) y Analítica conserva la primera carga (`demo.py:57`, `on_conflict_do_nothing`); `cargar.sh` no carga Analítica | 1) Confirmar comparando `factura.vence_el` y `hecho_factura.vence_el` (solo lectura). 2) `demo.py`: `on_conflict_do_update` de `emitida_el`, `vence_el`, `saldo`, `estado` en la semilla de `HechoFactura`. 3) `cargar.sh` corre `python -m app.demo cargar`. 4) Prueba en `tests/test_demo.py` (cargar con D y con D+1 mueve `vence_el`) | `fix/analitica/semilla-fechas` |
| PB-3 | P2 | La alerta de 1111AAA sale de `servicios/flota/test/integracion/reservas.spec.ts`: levanta `WorkerModule` con `RelayOutbox` sin fijar `AMQP_URL` y publica eventos reales en el RabbitMQ local | `reservas.spec.ts` apunta `AMQP_URL` a un RabbitMQ de Testcontainers (como `flota.spec.ts`) o a una dirección que no responde. La alerta vieja se borra con `reiniciar-demo.sh` (lo corre el usuario: borra los datos de demo locales) | `test/flota/aislar-broker` |
| PB-4 | Obs. | 3 s es D98; la consulta tiene índice | Solo medir con las trazas OTel y anotarlo en `pendientes-frontend-web.md` §5; FB-1 cubre la pantalla | (sin rama) |

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

## 7. Ajustes del revisor a las correcciones de front (aprobados)

- **CA-1:** `:where(a), :where(a:visited) { color: var(--mat-sys-primary) }` (especificidad 0, para no pisar `.marca`, botones ni ítems de menú).
- **NG-1:** son 18 usos en 8 archivos, no 57 (`cc-flota`: unidades, unidad, conduccion, chofer, combustible; `cc-operaciones`: rutas, ruta) más `tabla-reporte.ts:166` (`toFixed`). Pipe `numero` en `ui-comun/src/lib/formato.ts` con `Intl.NumberFormat('es-BO')`; sin `LOCALE_ID` (cambiaría fechas de Material). Guardián: eslint `no-restricted-imports` de `DecimalPipe` si hay eslint en centro-control.
- **RS-1:** agregar `apps` a `ui-comun/dominio/src/iconos.ts` y regenerar la fuente; el menú «Apps» conserva la marca «no disponible».
- **FB-1:** causa común (`errorPolicy: 'all'` escribe `null` en la caché). Un solo operador en `ui-comun` (`conservarUltimoBueno`) aplicado en los repositorios o fachadas con sondeo (19 `pollInterval` en 15 repositorios), con «Datos al …».
- **FB-2:** el arreglo va en `AvisoServicios` para todas las fichas: con `NO_ENCONTRADO` y sin datos, `search_off`, «No encontramos esta …» y sin «Reintentar».
- **NG-2:** mover `paramsCobranza` de `cc-finanzas/.../cobranza/domain/cobranza.ts` a `ui-comun/dominio` y usarlo en el reporte del tablero (−61/+30, `incluirVencidas`); actualizar `reporte.spec.ts`. No tocar la semántica de voz «esta semana».
- **NG-3:** archivo `cc-tablero/src/app/tablero/domain/tablero.ts:141`.
- **JV-2:** usar `diasVencida`, que ya trae `Factura`.
- **NG-4:** el motivo solo de lo que ya llega (km frente a `AVISO_KM`, documentos vencidos); si no, texto genérico. **NG-5:** sin columna de severidad (no hay dato; la interfaz no inventa).
- **FL-2:** «Cuentas por cobrar» se queda en Reportes (spec 015). Clientes resume la línea y enlaza a `cc-finanzas`. Cobranza muestra «Datos al».
- **FL-3:** máximo 6 pestañas en Operaciones sin mover Servicios (entrada del flujo 004) ni cambiar rutas que genera Analítica (`/viajes/{id}`, `/acciones/{id}`): «Mapa» como vista dentro de Viajes y «Decisiones» con Entregas observadas + Intervenciones; rutas viejas con `redirectTo`.
- **Quitado:** enlace de `CuentaInterna` al Tablero (necesitaría URL nueva y no sirve a todos los roles).

**Pruebas por corrección:** pipe `numero`; `conservarUltimoBueno`; `AvisoServicios` con `NO_ENCONTRADO`; marco sin desborde y con menú «Apps» bajo 900 px; `reporte.spec`; las de PB-1 a PB-3. En cada app: pruebas, lint y lista de íconos.

**Verificación en navegador:** 375, 800 y 1280 px, claro y oscuro (enlaces ≥ 4,5:1); sesiones gerente1, despachador1, jefeflota1, administracion1, comercial1, agroexport y un usuario recién registrado (sigue viendo «Completa los datos de tu empresa»); gerente1 en el portal ve `CuentaInterna` y su `POST /clientes` da 403.

**ICONIX (anotar):** rol `interno`, pestañas de Operaciones reagrupadas, los tres estados de error.

**Commits:** front en `feat/ui-comun/arreglos-ux-web` con scope por app; backend en las ramas de la sección 3, desde `develop`. Sin `Co-Authored-By`.

## 8. Estado

**Vuelta A (01-11-2026), hecha en `feat/ui-comun/arreglos-ux-web`, sin push.** Cada corrección con su prueba; `generar:verificar`, formato, capas, complejidad, pruebas de las 5 piezas y build de las 4 apps en verde; el portal pasa `npm run verificar`.

| Id | Qué quedó | Prueba |
|---|---|---|
| CA-1 | `:where(a), :where(a:visited)` con `--mat-sys-primary`, subrayado fino. Contraste con los tokens: 10,91:1 en oscuro (antes 1,98:1) y 6,13:1 en claro sobre `surface` | Medido con los tokens; sin prueba automática |
| NG-1 | Pipe `numero` (`ui-comun`) y función `numero` (`ui-comun/dominio`) con `Intl.NumberFormat('es-BO')`; reemplaza los 18 usos de `number` en `cc-flota` y `cc-operaciones` y el `NUMERO` de `tabla-reporte` | `ui-comun.spec.ts` (NG-1) |
| RS-1 | Bajo 900 px: menú «Apps» (ícono `apps`, fuente regenerada, 90 glifos) con la app actual (`aria-current`) y «(no disponible)» con `cloud_off`; el usuario queda con su ícono y su nombre solo para el lector; la marca se corta con puntos suspensivos | `marco.spec.ts` (RS-1) |
| FB-1 | Operador `conservarUltimoBueno` (`ui-comun/src/lib/sondeo.ts`) en los 19 sondeos; `cc-aviso-servicios [datosAl]` dice el error aunque haya filas y «Se muestran los datos al …» junto a «Reintentar» | `sondeo.spec.ts` y `aviso-servicios.spec.ts` (FB-1) |
| FB-2 | `cc-aviso-servicios` con `NO_ENCONTRADO` y sin datos: `search_off`, «No encontramos esta unidad…» (`buscado` en las 6 fichas) y sin «Reintentar» | `aviso-servicios.spec.ts` (FB-2) |
| NG-2 | `paramsCobranza` pasa a `ui-comun/dominio`; Reportes abre «Cuentas por cobrar» con −61/+30 e `incluirVencidas`; la tabla separa «Vencida» (error) y «Por vencer» (aviso) con chip, enlaza la factura a `cc-finanzas` con `?desde=` y pone «(BOB)» en los encabezados de monto | `reporte.spec.ts` y `aviso-servicios.spec.ts` (NG-2) |
| JV-2 | Chip «Vencida hace N días» (`Vigencia.VENCIDO`: `event_busy`, error) en la lista y el encabezado de la ficha; el estado se sigue mostrando si no es «Por cobrar»; `cc-estado` acepta `[texto]` | `filtro.spec.ts` (JV-2) |
| PB-1 paso 3 | `interno` en `ROLES_INTERNOS` del portal | `useSesion.test.ts` |

**Pendiente de la vuelta A:**
- Verificación en el navegador a 375/800/1280 px y en oscuro: no se pudo abrir una pestaña nueva (tope de pestañas del panel). Falta medir el ancho real a 375 px y ver el menú «Apps».
- Guardián de NG-1: no hay eslint en `centro-control`, así que no hay `no-restricted-imports` de `DecimalPipe`.
- Visto al probar: `FechaPipe` con hora sale como «1/11, 10:20 a. m.» en Node 26, donde corren las pruebas (no «01/11 10:20» como dice el comentario del pipe); falta ver si Chrome hace lo mismo. Afecta a todos los «Datos al …»; queda para la vuelta B.
