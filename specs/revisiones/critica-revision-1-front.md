# Revisión 1 (front) de la crítica de UX: vueltas A, B y C

Fecha: 01-11-2026. Rango revisado: `48898b4..a2b033d` en `feat/ui-comun/arreglos-ux-web` (40 commits, 130 archivos). Solo lectura.

**Cómo se revisó:** se leyó el diff completo de `ui-comun` (sondeo, formato, marco, aviso-servicios, datos-al, lista, tabla-reporte, base.css), las rutas y plantillas de las cuatro apps y del portal, y se compararon con DESIGN.md, el plan, las specs 010 y 016 y los contratos. Las pruebas se corrieron en una copia (`a2b033d`): ui-comun 128, cc-operaciones 26, cc-finanzas 20, cc-tablero 37 y cc-flota 14 en verde; portal 54 en verde. En el navegador, con la sesión de gerente1 en una pestaña propia, a 375 px: Operaciones, Tablero y Unidades.

**Lo que se comprobó y está bien:**
- `conservarUltimoBueno`: cada fachada con variables (periodo del tablero, estado de Viajes y Servicios, «con saldo» de Facturas, id de las fichas) hace `switchMap` a un `watch` nuevo, y el `defer` del operador arranca sin «último bueno». Al cambiar de filtro no aparecen filas del filtro anterior. Los anidados (`clientes[i].lineaCredito`) solo se reponen en filas que tienen error.
- `numero` es-BO: «1.300», «1.300,5», «0,65», «12.345,68». El ICU de Node 26 agrupa desde 4 cifras (es-BO no tiene el `minimumGroupingDigits: 2` de es-ES).
- `FechaPipe`: «dd/mm/aaaa» para `Fecha`; «dd/mm HH:mm» en La Paz para `Instante`, con `h23` (medianoche da «00», nunca «24»); un valor inválido se muestra tal cual.
- Rutas viejas: `/mapa?viaje=…`, `/entregas-observadas?q=…` e `/intervenciones` redirigen con sus parámetros. Medido: `/intervenciones?q=abc` → `/decisiones/intervenciones?q=abc`. Nada en `servicios/` genera esas rutas. `?de=` devuelve el viaje a `/decisiones/...`.
- Menú «Apps» a 375 px: `scrollWidth` 375, la app actual marcada y «(no disponible)» con `cloud_off`. Pestañas: `aria-selected` en la activa (Material usa `role="tab"` con `tabPanel`). Vistas: `aria-current="page"` y 44 px en táctil. Un solo `h1`. «Saltar al contenido» es la primera parada y el foco va a `main` sin contorno.
- Reportes abre con el primer reporte que el rol puede ver, ya consultado; `incluirVencidas` llega a la consulta y a la exportación.
- `vencida` sale de Finanzas solo con saldo (`Factura::diasVencida`), así que una factura pagada nunca muestra «Vencida hace N días».
- Portal: `interno` es cuenta interna. Un usuario recién registrado (`cliente` o sin roles) no lo es y sigue viendo «Completa los datos de tu empresa». `interno` junto a `comercial` tampoco cuenta como interna.
- `pasoLegible` usa exactamente los 8 nombres de `contratos/mcp/herramientas.md`.

## Hallazgos

| Id | Sev | Archivo:línea | Problema | Arreglo concreto |
|---|---|---|---|---|
| R1F-1 | P2 | `cc-flota/src/app/unidades/domain/unidad.ts:75-91` | `motivoBloqueo` da una causa que no es la real. Usa `AVISO_KM` (9.000) y solo los documentos ya `VENCIDO` (aviso de 30 días). La regla C de la spec 010 (D07) es **≥ 10.000 km** y documentos que vencen en **≤ 15 días**. Ejemplo: una unidad con 9.500 km y el SOAT por vencer en 10 días queda `MANTENIMIENTO_PENDIENTE` por el SOAT, pero la ficha dice «lleva 9.500 km desde el último mantenimiento» y no nombra el SOAT. Rompe la regla que se acaba de escribir en DESIGN.md («nunca un invento») | En el dominio, `KM_MANTENIMIENTO = 10_000` y `DIAS_AVISO_MANTENIMIENTO = 15` con el comentario «regla C, D07». El motivo de km solo con `>= KM_MANTENIMIENTO`. Los documentos con `venceEl − hoy ≤ 15`: «el SOAT vence el 10/11/2026» (o «venció el …»). Prueba con ese caso. `AVISO_KM` se queda solo para el ícono de «cerca del mantenimiento» |
| R1F-2 | P2 | `ui-comun/src/estilos/base.css` (global); visto en `cc-tablero/.../tablero/ui/tablero.ts:187` | En filas `display:flex` con texto largo, el `<mat-icon>` se encoge. Medido a 375 px en «Pide acción»: `notifications` queda en **10 px** de ancho y `warning` en 21: se ve un trazo, no el ícono. Lo destapó el texto más largo de NG-3. Tienen el mismo riesgo `.aviso-servicio` (los textos nuevos de FB-6 son largos) y `.aviso-documentos` con el motivo de NG-4 | Una línea en `base.css`: `.mat-icon { flex-shrink: 0; }`. Volver a medir a 375 px el tablero, la ficha de cliente con Finanzas caída y la ficha de 7341CST |
| R1F-3 | P2 | `cc-tablero/src/app/tablero/domain/tablero.ts:85-92` y `tablero/ui/tablero.ts:74,92,110,134` | «Sin acceso a …» usa `cloud_off`, que DESIGN.md reserva para «un servicio no responde». Tampoco dice quién puede verlo. Las cifras dicen solo «Sin acceso» | Ver la decisión 5a: `lock_person` y el texto «Sin acceso a facturas en mora: las ven gerencia y administración.», con los roles sacados de `ROLES_CAMPO` |
| R1F-4 | P2 | `ui-comun/src/lib/acceso.ts:22-33` | La página `/sin-acceso` solo ofrece «Cerrar sesión». La fila «Sin permiso» que esta vuelta escribió en DESIGN.md pide «Volver o ir a la app que sí abre». Un jefe de flota que abre un enlace de Operaciones queda sin salida, salvo cerrar sesión | Para un rol interno: «Tu rol no abre esta app.», la lista de `APPS_POR_ROL` del rol como enlaces (`config.urls[app]`) y «Cerrar sesión» como botón de texto. Prueba en `ui-comun.spec.ts` |
| R1F-5 | P3 | `ui-comun/dominio/src/formato.ts:18-29` | `numero('  ')` da «0» (`Number('  ') === 0`), y un valor que se redondea a cero desde negativo da «-0» | `if (valor === null \|\| valor === undefined \|\| String(valor).trim() === '') return SIN_DATO;` y `signDisplay: 'negative'` en el `Intl.NumberFormat`. Dos casos en `ui-comun.spec.ts` |
| R1F-6 | P3 | `ui-comun/src/lib/sondeo.ts:57-64` | El operador repone un campo raíz con **cualquier** error. Con `NO_ENCONTRADO` o `SIN_PERMISO` mostraría datos viejos como si solo hubiera fallado la red. Hoy no pasa: ninguna ficha borra ni cambia permisos a mitad de sesión. Es solo endurecer | Reponer solo si el error no es GraphQL (red o Gateway) o si su `codigo` es `DEPENDENCIA_NO_DISPONIBLE`. Con esa condición agregada, un caso en `sondeo.spec.ts` |
| R1F-7 | P3 | `ui-comun/src/lib/marco.ts:84` | En el menú «Apps», la app caída es un `mat-menu-item disabled`. Material la salta con las flechas, así que el lector de pantalla no oye «(no disponible)» | Agregar `disabledInteractive` (como ya hace «Reintentar») |
| R1F-8 | P3 | `ui-comun/src/lib/formato.ts:45` | `fecha: true` no lleva año. Un «Datos al …» o un hito de otro año se lee como de este | Si el año del instante (en La Paz) no es el actual, «dd/mm/aaaa HH:mm». Un caso más en la prueba del pipe |
| R1F-9 | P3 | Plan §4 (no se tocó) | Los sondeos siguen corriendo con la pestaña oculta (unas 1.200 peticiones en 10 min, según el plan) | Fuera de esta vuelta: anotarlo en `pendientes-frontend-web.md` §5 como pendiente de rendimiento. Pausar con `document.visibilityState` en el mismo `conservarUltimoBueno` o en `proveerApollo` |

No hay P0 ni P1. Las vueltas A, B y C cumplen el plan y su §7 en lo demás.

## Flujos por rol (leídos en rutas y plantillas)

| Rol | Recorrido | Resultado |
|---|---|---|
| Despachador | Decisiones → «Revisar y decidir» (`?de=entregas-observadas` o `intervenciones`) → ficha → decide → miga y «volver» a `/decisiones/...` | Bien. Desde la ficha, cliente y ruta enlazan dentro de Operaciones y la unidad, a Flota. El despachador no abre Flota, así que para él `urlEnApp` deja la placa en texto |
| Jefe de flota | Unidades abre con lo que no puede salir → ficha → motivo → «Programar mantenimiento» | Funciona, pero el motivo puede dar una causa equivocada (R1F-1) y el ícono se encoge a 375 px (R1F-2) |
| Administración | Facturas (chip «Vencida hace N días») → ficha → pago con confirmación | Bien. El chip sale en la lista y en el encabezado, y un pago parcial sigue mostrando su estado |
| Comercial | Servicios → «Ver como cliente»; ficha de cliente con la línea resumida | Bien. Sin Finanzas, el texto dice que el detalle lo lleva Finanzas |
| Gerente | Tablero → «Pide acción» (`/cobranza`, `/unidades?estado=MANTENIMIENTO_PENDIENTE`, con `?desde=cc-tablero`) → la app destino → «Volver a Tablero» | Bien. Falta R1F-2 en 375 px, y el «Sin acceso» del tablero (R1F-3) |
| Cliente (portal) | Cotizar → confirmar → seguir (posición «-17,7833; -63,1821») → POD → factura | Sin cambios de flujo. Toneladas, km y posición pasan por `numero`. Un `h1` por página y el resto en `h2` |
| Cuenta interna (portal) | Token con `interno` → `CuentaInterna` en todas las rutas | Bien en el front. Depende de PB-1 (realm), que todavía no está en `develop`: hasta entonces, gerente1 sigue cayendo en «Completa los datos» |
| Recién registrado | Sin `interno` → sigue el camino del cliente («Completa los datos de tu empresa») | Bien |

## Decisiones aprobadas

### 5a. Ícono y texto de «sin permiso»

**Veredicto: `lock_person`.** Es un candado con una persona: «no es para tu rol». No choca con `lock` («Cerrado») ni con `person_off` («Chofer inhabilitado»), y respeta «un ícono, un significado».

**Sí, el «Sin acceso a …» del tablero dice quién puede**, sacándolo de `ROLES_CAMPO` (`ui-comun/dominio/src/permisos.ts`), la misma tabla que usa `puedeVer`. No es un dato nuevo ni un invento. En la práctica casi nunca se ve, porque `bloquesVisibles` ya pide solo lo que el rol ve; aparece si el front y los `@roles` del Gateway se desalinean. Por eso tiene que ser correcto y barato, no vistoso.

Pasos (en `feat/ui-comun/arreglos-ux-web`):
1. `lock_person` en `ui-comun/dominio/src/iconos.ts`, y después `npm run iconos:generar` (93 glifos).
2. DESIGN.md: fila `| lock_person | Sin permiso: el rol no ve o no hace esto |` en la tabla de íconos, y «Por decidir…» de la tabla de errores cambiado por `lock_person`.
3. `ui-comun/dominio`: `quienesVen(campo)` sobre `ROLES_CAMPO`, que da «gerencia y administración» (nombres de rol para personas, en una lista cerrada). Prueba.
4. `tablero.ts:85-92`: con `sin-acceso`, ícono `lock_person` y texto `Sin acceso a ${que}: las ven ${quienesVen(campo)}.`. En las cifras (`tablero/ui/tablero.ts`), `<mat-icon>lock_person</mat-icon> Sin acceso`. Actualizar `tablero.spec.ts`.
5. R1F-4 (la página `/sin-acceso` con las apps del rol) en el mismo commit o en el siguiente: `fix(ui-comun): dice sin permiso con su ícono y lleva a la app que el rol abre`.

### 5b. `choferId` en `Viaje` y `unidadId` en `AnomaliaCombustible`

**`Viaje.choferId`: aprobado.** El chofer no tiene otra clave estable: el nombre no es único y el comercial no ve `choferes`. Viajes ya lo guarda (`dominio/viaje/Asignacion.java`). Hoy el `Viaje` de `contratos/openapi/viajes.yaml` (línea 1151) no lo expone, así que «contratos primero» incluye ese archivo, no solo el GraphQL.

**`AnomaliaCombustible.unidadId`: rechazado como cambio de contrato.** Se resuelve sin tocar contratos ni Analítica. La placa es única (`PLACA_DUPLICADA`, 409) y no cambia (spec 010, paso 2: el `PUT` no acepta `placa`). La consulta de Combustible en cc-flota agrega `unidades { unidadId placa }`, que ya existe en el esquema con `@roles` gerente, despachador y jefe_flota, y la página arma el mapa placa → id. Así se evitan una columna nueva en el hecho de combustible, una migración y un cambio a `analitica.yaml`. Se borra la segunda fila de la tabla de `pendientes-frontend-web.md` §5.

Pasos:
1. Rama `feat/gateway/enlaces-fichas`, desde `develop` (`git switch -c feat/gateway/enlaces-fichas develop`, `git push -u origin feat/gateway/enlaces-fichas`). La pieza es `gateway` porque es la que compone; el commit de Viajes lleva su propio scope.
2. Commit `feat(viajes): expone el chofer asignado del viaje`. En el mismo commit (contratos primero): `choferId: Uuid` **opcional y nullable** en el schema `Viaje` de `contratos/openapi/viajes.yaml` (null antes de `CONFIRMADO`); el DTO de respuesta de Viajes lo toma de `Asignacion`; prueba del controlador o del contrato. Es un campo opcional nuevo, así que es compatible: mcp-server (`obtener_viajes_en_curso`) y app-chofer siguen compilando. Correr las pruebas de los tres.
3. Commit `feat(gateway): agrega choferId al Viaje`. `choferId: ID` (nullable, sin `@roles`: un id solo no expone nada) en `type Viaje` de `contratos/graphql/centro-control.graphql`; el mapeo `m.viaje` lo pasa; prueba del resolvedor. Pruebas y lint del gateway.
4. PR a `develop`. Con CI en verde, merge.
5. En el front, después del merge: traer `develop` a `feat/ui-comun/arreglos-ux-web`, `npm run generar` y `generar:verificar`. Commit `fix(cc-operaciones): enlaza el chofer del viaje a su ficha en Flota`: en `viaje.ts`, `urlEnApp(config, roles, 'cc-flota', '/choferes/' + id)`, igual que la unidad, y texto si el rol no abre Flota. Sin `choferId`, texto.
6. Commit `fix(cc-flota): enlaza la anomalía de combustible a la ficha de su unidad`: `unidades { unidadId placa }` en la consulta de Combustible y `/unidades/{id}`. Si la placa no aparece, se queda el enlace actual `/unidades?q=`. Prueba del mapa placa → id.
7. Actualizar `pendientes-frontend-web.md` §5 y la fila «Enlaces entre fichas» del plan (§9, ICONIX). No hay agregado, evento ni estado nuevo.

## Veredicto

**Aprobado con cambios.** Antes de cerrar la vuelta: R1F-1 (causa del bloqueo según la regla C real), R1F-2 (una línea de CSS) y 5a con R1F-3 y R1F-4 (sin permiso con `lock_person`, quién puede y salida). R1F-5 a R1F-8 son pulido y pueden ir en el mismo paso o anotarse. R1F-9 se anota. 5b va en su propia rama desde `develop`: solo `choferId` con contrato; `unidadId` en el front, sin contrato. Falta verificar en el navegador con sesiones de despachador, jefe de flota, administración, cliente y un recién registrado (no se pidieron credenciales), y el portal en oscuro.

## Estado

01-11-2026, en `feat/ui-comun/arreglos-ux-web`. Antes de cada commit: `generar:verificar`, `formato`, `capas`, `complejidad`, `probar` y `construir` en `centro-control`, y `verificar` en el portal, en verde (ui-comun 132, cc-operaciones 26, cc-finanzas 20, cc-tablero 37, cc-flota 15).

| Id | Estado | Commit | Nota |
|---|---|---|---|
| R1F-1 | Hecho | `9218e82` | `KM_MANTENIMIENTO = 10_000` y `DIAS_AVISO_MANTENIMIENTO = 15` (regla C, D07). Nombra todas las causas que se cumplen: «lleva 10.000 km…; la inspección técnica venció el 20/10/2026». Prueba con el ejemplo del informe (9.500 km y SOAT a 10 días → solo el SOAT). `AVISO_KM` queda para «cerca del mantenimiento». En el navegador, 7341CST: «No puede salir: lleva 10.380 km desde el último mantenimiento» |
| R1F-2 | Hecho | `a9e50a4` | `.mat-icon { flex-shrink: 0 }` en `base.css`. Medido a 375 px en «Pide acción»: los tres íconos en 24 px (antes `notifications` 10 px). El portal no lo necesita: `SvgIcon` de MUI ya trae `flexShrink: 0` |
| R1F-3 y 5a | Hecho | `3bb6d65` | `lock_person` en `iconos.ts` (fuente regenerada, 93 glifos); `quienesVen(campo)` sobre `ROLES_CAMPO`; tablero: «Sin acceso a facturas en mora: las ven gerencia y administración.» y `lock_person` en las cifras. DESIGN.md sin el «Por decidir» |
| R1F-4 | Hecho | `3bb6d65` | `/sin-acceso` enlaza las apps del rol (`appsDeRoles`, la misma lista que la barra) y deja «Cerrar sesión». Si el rol sí abre la app (una página con guarda propia) dice «Tu rol no abre esta página». Visto con gerente en Flota |
| R1F-5 | Hecho | `66fc800`, `33a5d0d` | Espacios → «Sin dato»; «-0» → «0». `signDisplay: 'negative'` no está en los tipos de TS: se quita el signo del cero con una expresión regular. También en el `numero` del portal |
| R1F-6 | Hecho | `6618bc7` | Se repone un campo raíz solo con un error que no es GraphQL o con `DEPENDENCIA_NO_DISPONIBLE` en ese campo. Los anidados no cambian |
| R1F-7 | Hecho | `eabcbdf` | `disabledInteractive` en la app caída del menú «Apps»: `aria-disabled` y alcanzable con las flechas, el lector dice «(no disponible)». No se vio en el navegador: ninguna app estaba caída |
| R1F-8 | Hecho | `66fc800` | `fecha: true` da «dd/mm/aaaa HH:mm» si el año en La Paz no es el actual |
| R1F-9 | Hecho | `b890f53` | En vez de anotarlo: `skipPollAttempt` con `document.visibilityState` en las opciones de Apollo (todos los sondeos) y la revisión de salud de las apps se salta con la pestaña oculta. Al volver, las consultas con sondeo se piden enseguida |
| 5b (`unidadId`) | Hecho | `596ed14` | Sin contrato: Combustible pide `unidades { unidadId placa }` y enlaza anomalías y cargas a `/unidades/{id}`; sin la placa, a `/unidades?q=`. En los datos locales las anomalías son de placas que Flota no tiene (6101HIS…), así que en el navegador se vio el enlace de respaldo; el enlace por id lo cubre la prueba |
| 5b (`choferId`) | Pendiente | — | Va en `feat/gateway/enlaces-fichas`, desde `develop`, con cambio de contrato. El enlace del chofer en la ficha del viaje se hace después del merge |

Falta lo mismo que dice el veredicto: probar con sesiones de despachador, jefe de flota, administración, cliente y un recién registrado, y el portal en oscuro.
