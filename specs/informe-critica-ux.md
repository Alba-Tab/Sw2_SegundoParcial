# Informe: correcciones de la crítica de UX/UI

Fecha: 01-11-2026. Origen: crítica en el navegador de las 4 apps del Centro de Control y el portal (`specs/plan-critica-ux.md`). La app móvil no se modificó; solo se regeneró su cliente de API desde el contrato, con autorización expresa.

## 1. Cómo se trabajó

1. **Plan aprobado antes de tocar código.** Un agente revisor aprobó el plan con cambios (`fe72bfb`). Corrigió tres diagnósticos: PB-1 abría un hueco de seguridad, PB-2 no era UTC y PB-3 venía de una prueba de Flota. Cada ajuste posterior (rol `interno` en todos los tokens, PB-5, `choferId`, el arreglo del hallazgo de Codex) también pasó por un revisor antes de implementarse.
2. **Tres vueltas de corrección en el front** (A: P1, B: P2, C: P3 y reglas de diseño) y **cuatro ramas de backend**, cada una desde `develop` y en su worktree.
3. **Dos pasadas de revisión** con agentes, separadas en front y backend, recorriendo los flujos por rol. Sus informes y el estado de cada hallazgo están en `specs/revisiones/critica-revision-{1,2}-{front,back}.md`.
4. **Revisión final con Codex** (`codex review`, modelo `gpt-6-luna`, solo lectura) sobre las cinco ramas. Encontró un P2 en plataforma; se arregló con un plan aprobado y Codex lo volvió a revisar sin hallazgos.

## 2. Ramas (sin push)

| Orden de merge | Rama | Commits | Qué resuelve |
|---|---|---|---|
| 1 | `fix/plataforma/rol-interno-portal` | 9 | PB-1 y PB-5 (seguridad) |
| 2 | `test/flota/aislar-broker` | 1 | PB-3 |
| 3 | `fix/analitica/semilla-fechas` | 3 | PB-2 |
| 4 | `feat/gateway/enlaces-fichas` | 4 | `choferId` en el viaje |
| 5 | `feat/ui-comun/arreglos-ux-web` | 84 sobre `develop` (69 de este ciclo) | Todo el front |

El merge de las cinco en ese orden se simuló sin conflictos. Todos los commits siguen Conventional Commits en español y no llevan `Co-Authored-By`.

## 3. Backend y plataforma

- **PB-1, cuentas internas en el portal (seguridad).** Un gerente que entraba al portal veía «Completa los datos de tu empresa» y, si lo completaba, Viajes creaba un cliente con su cuenta y Finanzas le abría crédito. Ahora existe el rol de realm `interno` (sin permisos), compuesto de gerente, despachador, jefe de flota, administración y chofer, y el portal solo recibe ese rol. Viajes responde 403 `SIN_PERMISO` al alta de una cuenta interna y la prueba confirma que no se crea ningún cliente. Por la expansión de compuestos, `interno` llega también a los demás tokens; un revisor auditó todos los consumidores de roles y solo la auditoría de Finanzas dependía del orden (ahora usa una lista fija). Probado en el Keycloak local: `probar-realm.sh` 32/32.
- **PB-5, cuentas de servicio en el grupo del portal.** `service-account-analitica` había caído en `registro-portal`, y `reiniciar-demo.sh` la habría borrado. `configurar-api.sh` las saca del grupo y `reiniciar-demo.sh` las excluye, las dos por id exacto (no por nombre, que un usuario podría imitar). Aplicado en local: el grupo quedó vacío y la cuenta sigue existiendo.
- **PB-2, una misma factura con dos vencimientos.** No era zona horaria: Finanzas actualizaba las fechas al recargar la semilla y Analítica conservaba las de la primera carga. Analítica ahora actualiza facturas y viajes de semilla, y `cargar.sh` también la carga.
- **PB-3, la alerta de la unidad 1111AAA.** La generaba una prueba de Flota que publicaba eventos en el RabbitMQ local. Ahora usa su propio RabbitMQ de Testcontainers.
- **`choferId`.** Contrato de Viajes y GraphQL primero, después Viajes y gateway. Los clientes generados del portal y de la app móvil se regeneraron; para la app es solo un campo opcional nuevo.
- **PB-4 (Viajes corta a los 3 s del gateway).** Queda como observación (D98) en `specs/pendientes-frontend-web.md` §5; el front ya conserva los datos si un sondeo falla.

## 4. Front

**Contraste y accesibilidad.** Los enlaces usan el color del tema (en oscuro pasaron de 1,98:1 a 10,9:1). Hay un enlace «Saltar al contenido» y `color-scheme`. Objetivos de 44 px en táctil, un solo `h1` por página y `<main>` en el portal. El mapa tiene una lista en texto y los íconos ya no se encogen.

**Jerarquía y reglas de diseño.**
- Números en formato `es-BO` y fechas en 24 h, hora de La Paz.
- Facturas vencidas con su chip.
- Unidades ordenadas por urgencia; la ficha dice por qué una unidad no puede salir (regla de la spec 010) y quién lo resuelve.
- El agente se lee en frases.
- Pestañas sin estirar, Roboto empaquetada en el portal y `text-wrap`.
- Las 8 reglas nuevas quedaron en `DESIGN.md`.

**Feedback.**
- Una actualización que falla ya no vacía la tabla: se muestra «Se muestran los datos al …».
- «No encontrado», «servicio caído» y «sin permiso» son tres avisos distintos, cada uno con su ícono y su salida.
- Pantalla «Abriendo …» al entrar y «Cargando…» en los contadores.
- Aviso cuando los datos tienen más de 30 minutos.
- Confirmación antes de marcar resuelta una intervención (cancela el viaje).

**Responsive.** A 375 px no hay desborde: las apps pasan a un menú «Apps» y el usuario queda como ícono. El estado va en segunda columna y montos e identificadores no se parten.

**Rendimiento.**
- Los sondeos se pausan con la pestaña oculta.
- La fuente de íconos pesa 14 kB.
- Carga inicial de cada app Angular: unos 230 kB transferidos. Portal: 191 kB gzip.

**Negocio, flujos y arquitectura de información.**
- El reporte de cuentas por cobrar incluye lo vencido.
- Los textos dependen del rol y cada pantalla dice quién toma la decisión cuando no es el usuario.
- El tablero solo enlaza a apps que el rol puede abrir.
- Operaciones baja de 8 a 6 pestañas: Viajes (lista y mapa) y Decisiones. Las rutas viejas siguen funcionando.
- Las fichas se enlazan entre sí con `?desde=`.
- La cuenta interna del portal ve «Esta cuenta es del Centro de Control».

## 5. Verificación

| Pieza | Resultado |
|---|---|
| Centro de Control | `generar:verificar`, formato, capas, complejidad, pruebas (ui-comun 137, operaciones 29, finanzas 23, tablero 39, flota 15) y build de las 4 apps |
| Portal | tipos, lint, formato y 55 pruebas |
| Viajes | `mvnw verify` (38 unitarias y 46 de integración) y Spotless |
| Finanzas | Pest 70/70, Deptrac y Larastan |
| Analítica | 71 pruebas, ruff e import-linter |
| Flota | 69 pruebas |
| Gateway | 27 pruebas y contratos válidos |
| Keycloak local | `probar-realm.sh` 32/32 |
| Codex | Cinco ramas sin defectos tras el arreglo de `reiniciar-demo.sh` |

En el navegador, como gerente: 375, 800 y 1280 px, claro y oscuro.

## 6. Lo que falta y lo que tiene que hacer el usuario

1. **Publicar:** `git push -u` y un PR por rama, en el orden de la sección 2.
2. **Después del merge, en local:** aplicar el realm (`aplicar-realm.sh` y `probar-realm.sh`), reconstruir las imágenes de `viajes`, `gateway` y `analitica`, y correr `plataforma/scripts/reiniciar-demo.sh`. Ese script borra la alerta falsa de 1111AAA y alinea las semillas, pero reinicia los datos de demo.
3. **Nube:** definir `VITE_CENTRO_URL` al construir el portal (hoy solo está en `.env.example`).
4. **Siguiente rama:** el enlace a la ficha del chofer desde el viaje, después del merge de `feat/gateway/enlaces-fichas`.
5. **Sin verificar en pantalla:** las sesiones de despachador, jefe de flota, administración, comercial, cliente y usuario recién registrado. Esos casos están cubiertos por pruebas.
6. **Decisiones para revisar:** «Aprobar entrega» no pide confirmación, igual que las demás aprobaciones. El rol se nombra «jefatura de flota».
7. **ICONIX (anotar, sin editar `.eap`):** rol `interno`, pestañas de Operaciones, los tres estados de error y los enlaces entre fichas (plan, sección 9).
8. **Codex:** tu `~/.codex/config.toml` usa `gpt-6-sol`, que el CLI no acepta con cuenta de ChatGPT. Para la revisión se forzó `gpt-6-luna` por comando, sin tocar tu configuración.
