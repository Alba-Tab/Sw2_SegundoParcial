# Revisión 2 (final antes de Codex): backend, contratos y plataforma

Revisor: pasada 2, solo lectura. Fecha: 01-11-2026. No se editó ni se commiteó nada en los worktrees de trabajo y no se aplicó nada al Keycloak ni a las bases locales.

Ramas revisadas. Todas salen de `origin/develop` (`e7045c4`) y **ninguna está publicada todavía** (no existe `origin/<rama>`):

| Rama | Commits |
|---|---|
| `fix/plataforma/rol-interno-portal` | 432f98c, b0c702f, e2c83b1, 471265e, f0ef0c8, 8691730 (PB-5), 048b0f9 (R1B-9) |
| `fix/analitica/semilla-fechas` | d53f4f2, 802eecf, ad309a9 (R1B-4 y R1B-5) |
| `test/flota/aislar-broker` | eb08031 |
| `feat/gateway/enlaces-fichas` | dd4dd02, 362f0ba, 0060dc2, 8446e4e (5b) |
| `feat/ui-comun/arreglos-ux-web` (solo para los merges) | hasta c587417 |

## Pruebas corridas

Todas en copias `/private/tmp/claude-501/rev2-*` (ya borradas), con los mismos pasos que `ci.yml`.

| Rama | Pieza | Qué | Resultado |
|---|---|---|---|
| plataforma | Viajes | `./mvnw spotless:check` | **FALLA**: `ClientesIT.java:210` (R2B-1) |
| plataforma | Viajes | `./mvnw verify` (Testcontainers, ArchUnit) | BUILD SUCCESS; ClientesIT 8/8 |
| plataforma | Finanzas | La imagen `dev` construida desde la copia, con un PostgreSQL 17 y un RabbitMQ propios en una red aislada: `pint --test`, `pest`, `deptrac`, `phpstan` | Pest 70/70; Deptrac 0 violaciones; Larastan sin errores |
| plataforma | Keycloak | Keycloak 26.8 **descartable en el puerto 18080** (el del compose, en el 8080, no se tocó). `aplicar-realm.sh` y `probar-realm.sh` con un `.env` del scratchpad | Realm limpio: **32/32**. Aplicando primero el realm de `develop` y luego el de la rama: **32/32**. La subida de versión funciona |
| plataforma | Keycloak (PB-5) | En ese mismo Keycloak: se crea un cliente con cuenta de servicio, que cae en `registro-portal`; se crea un usuario real `service-account-falso` y se corre `configurar-api.sh` | La cuenta de servicio sale y el usuario real queda. El filtro de `reiniciar-demo.sh` deja fuera a los dos (falla del lado seguro, como se diseñó) |
| analitica | Analítica | `ruff check`, `ruff format --check`, `lint-imports`, `pytest -q` | 71/71; lint limpio; contratos de capas 2/2 |
| flota | Flota | `generar:contratos:verificar`, `npm run verificar` | 69/69 en 9 suites; tipos, capas y formato limpios |
| gateway | contratos | `npm run validar` | AsyncAPI, Spectral (0 avisos) y GraphQL (77 tipos) válidos |
| gateway | Viajes | `spotless:check` y `./mvnw verify` | Limpio; BUILD SUCCESS (ServiciosIT 24/24) |
| gateway | Gateway | `npm run verificar` | 27/27; tipos y formato limpios |
| gateway | Portal | `generar:contratos:verificar` y `verificar` | Sin diferencias en lo generado; 37/37 |
| gateway | app-chofer | `generar:contratos:verificar` y `verificar` | Sin diferencias (solo cambia `generado/viajes.ts`); 48/48 |
| gateway | Centro de Control | `generar:verificar` | Sin diferencias: `typescript-operations` solo emite lo que piden las operaciones |
| gateway | mcp-server | `npm run verificar` (CI no lo dispara) | 12/12. Mapea campo por campo y no expone `choferId` al LLM |
| todas | commitlint | `commitlint --from origin/develop --to <rama>` | Sin errores en las 4 ramas. Ningún commit lleva `Co-Authored-By`, `Signed-off-by` ni "Generated with" |

Falta correr: `npm run build` y `storybook:build` del portal, `npm run verificar` completo de centro-control y `npm run empaquetar` de app-chofer. En `feat/gateway/enlaces-fichas` solo cambian tipos generados y un campo de esquema que ninguna operación pide, así que el riesgo es bajo. Tampoco corrí gitleaks; revisé el diff a mano y no hay secretos.

## Hallazgos

| Id | Sev. | Rama | Archivo:línea | Problema | Arreglo |
|---|---|---|---|---|---|
| R2B-1 | **P1** | `fix/plataforma/rol-interno-portal` | `servicios/viajes/src/test/java/bo/transporte/viajes/ClientesIT.java:210` (commit 048b0f9) | La línea `assertEquals(antes, jdbc.sql(...).single());` pasa del ancho de Palantir. El job `viajes` corre `spotless:check` antes que las pruebas, así que **la CI de la rama falla** y `ci-ok` queda en rojo | `cd servicios/viajes && ./mvnw spotless:apply`, que la parte en tres líneas. Como la rama no está publicada, va como `fixup` de 048b0f9 (o como un commit `test(viajes): ...` aparte). Después, `./mvnw -q spotless:check` |
| R2B-2 | P3 | `fix/plataforma/rol-interno-portal` | `specs/000-convenciones.md:212`, frente a `servicios/gateway/src/autenticacion.ts:6`, `frontends/centro-control/projects/ui-comun/src/lib/sesion.ts:6` y `specs/016-gateway-centro-control.md:11` | El rol `interno` lo llevan los internos y el chofer, pero no `comercial`. `ROLES_INTERNOS` y el "Usuario interno" de la spec 016 son al revés: incluyen `comercial` y excluyen `chofer`. Hoy no falla, porque los servicios ignoran `interno`, pero invita a que alguien agregue `interno` a `ROLES_INTERNOS` o crea que `comercial` lo recibe. El README de Keycloak lo dice; 000 no | Agregar una frase en 000:212: "No es la lista `ROLES_INTERNOS` del Gateway: lo llevan `chofer` y los internos salvo `comercial`, que sí usa el portal" |
| R2B-3 | Obs. | `feat/gateway/enlaces-fichas` | `contratos/openapi/viajes.yaml:1182-1186` y `contratos/graphql/centro-control.graphql:136-137` | La descripción dice "null antes de CONFIRMADO", pero un `Viaje` siempre tiene `Asignacion`: `ViajeVista.de` usa `a.choferId()` sin condición, y `placa` y `choferNombre` son obligatorios. El único `null` real viene de una respuesta idempotente guardada antes del cambio, porque `ViajeVista` se guarda como JSON | Opcional. Si se cambia el texto ("nullable solo por las respuestas idempotentes guardadas antes"), hay que regenerar `viajes.ts` y `viajes.zod.ts` del portal y `viajes.ts` de app-chofer, que copian la descripción. El usuario autorizó regenerar ese archivo de `movil/` |
| R2B-4 | Obs. | `feat/gateway/enlaces-fichas` | Commits dd4dd02, 0060dc2 y 8446e4e | En dd4dd02 el contrato cambia, pero los clientes generados del portal y de app-chofer quedan atrasados hasta los dos commits `chore`. En ese commit, `generar:contratos:verificar` fallaría. La CI solo mira la punta del PR, que está en verde | Opcional: juntar los dos `chore` en dd4dd02 ("un commit compila y pasa sus pruebas"). Si no, dejarlo así |
| R2B-5 | Obs. | `fix/analitica/semilla-fechas` | Commit ad309a9; `plataforma/scripts/README.md:9` | El commit `fix(analitica)` también trae el `--profile ia` del README de scripts (R1B-4), que es de la pieza `plataforma` | Opcional: separarlo en `docs(plataforma): levanta el perfil ia antes de cargar la semilla` |
| R2B-6 | Obs. | `fix/plataforma/rol-interno-portal` | `servicios/finanzas/app/Infraestructura/Persistencia/AuditoriaDb.php:21` | R1B-8 sigue sin aplicar: `$quien->roles ?? []` junto a `$quien?->sub`. No falla | Opcional: `$quien?->roles ?? []` |
| R2B-7 | Obs. (pasos del usuario) | `fix/plataforma/rol-interno-portal`, `feat/gateway/enlaces-fichas` | — | El Keycloak local todavía tiene a `service-account-analitica` en `registro-portal` hasta que se corra `aplicar-realm.sh`; en cada nube igual. Con el filtro nuevo, `reiniciar-demo.sh` ya no la borra aunque se corra antes. Después de mergear el gateway, las imágenes locales de `viajes` y `gateway` no traen `choferId` hasta reconstruirlas | Después del merge: `aplicar-realm.sh plataforma/compose/.env` y luego `probar-realm.sh` (32 pruebas). Para la verificación del front, `docker compose ... up -d --build viajes gateway` |
| R2B-8 | Obs. | `feat/ui-comun/arreglos-ux-web` | `specs/pendientes-frontend-web.md:76` y la fila "5b (`choferId`) Pendiente" de `critica-revision-1-front.md` | Cuando entre `feat/gateway/enlaces-fichas`, esa fila queda vieja: el contrato ya existirá. El paso 5 de 5b (enlazar el chofer en la ficha del viaje) sigue pendiente | En la rama del front que haga el paso 5 (después del merge del gateway): `npm run generar`, el enlace y borrar la fila 76 |
| R1B-10 | Obs. (viene de antes, fuera de alcance) | — | `plataforma/keycloak/configurar-api.sh` (permiso `viajes-map-roles-usuarios`) | Sigue igual: `map-roles` sobre todos los usuarios. Es un límite documentado de FGAP v2 | Anotarlo para ICONIX y seguridad |

No encontré nada P0. El único P1 (R2B-1) es de formato, pero bloquea la CI.

### Lo que revisé y está bien

- **Rol `interno`, probado en un Keycloak real y no solo leído.** En el token de `portal-cliente`:
  - gerente1 y chofer1 traen solo `interno`;
  - agroexport trae `cliente` y comercial1 trae `comercial`.

  Fuera del portal:
  - **D27**: `offline_access` sigue saliendo solo para el chofer.
  - **K1**: la cadena de tres intercambios conserva `sub`, `sid` y `gerente,interno`.
  - **FGAP**: Viajes sigue sin poder leer ni editar a gerente1 ni asignar `gerente`.

  Los servicios no le dan permisos a `interno`:
  - El Gateway filtra con `ROLES_INTERNOS`; un chofer en `cc-*` recibe 403.
  - mcp-server audita con `rolDe` sobre una lista cerrada.
  - Flota autoriza con `includes` y `some` sobre listas cerradas, y no tiene tabla de auditoría.
  - app-chofer no lee roles.
  - Finanzas autoriza con `tiene` y `tieneAlguno`.
- **Auditoría de Finanzas.** Ahora el orden es determinista y un token con solo `interno` guarda `actor_rol = null`. Viajes, Analítica y mcp-server ya elegían el rol con una lista.
- **403 de Viajes.** `interno` está en `SIN_ALTA`. La prueba nueva comprueba 403, `SIN_PERMISO` y que no se crea ningún cliente (cierra R1B-9).
- **PB-5.**
  - `configurar-api.sh` saca a las cuentas de servicio por id exacto (`/clients/{id}/service-account-user`), con `|| true` en cada DELETE, así que no corta el `set -e`.
  - `reiniciar-demo.sh` salta el prefijo `service-account-`, y la falla queda del lado seguro.
  - La prueba se renombró (R1B-3). Los dos README están al día.
- **Semilla de Analítica.**
  - `upsert` con `on_conflict_do_update` solo en las columnas pedidas. Sin columnas, sigue con `do_nothing`.
  - Las facturas y los viajes de la semilla se mueven con `dia()` igual que en Finanzas (R1B-5). La prueba nueva recarga en dos días distintos.
  - `cargar.sh` carga Analítica con `--profile ia` y el README la construye (R1B-4).
- **Flota.** `reservas.spec.ts` levanta su propio RabbitMQ con Testcontainers y lo apaga en `afterAll`. Es el mismo patrón que `flota.spec.ts`.
- **`choferId` (5b).**
  - Contratos primero: `viajes.yaml` cambia en el mismo commit que Viajes y `centro-control.graphql` en el mismo que el Gateway.
  - El campo es opcional y *nullable*, así que es compatible con todos los consumidores. Los regenerados del portal y de app-chofer coinciden con `orval`.
  - Es el id de Flota (`01933c00-…`), no el `sub` de Keycloak. El cliente no ve viajes (`GET /viajes/{id}` responde 403 a `cliente`); el chofer solo ve el suyo.
  - En GraphQL va sin `@roles`, igual que los otros ids del tipo.
  - Las respuestas idempotentes viejas se leen igual: el record se deserializa por nombre y el campo falta, así que queda en `null`.
  - En `movil/` solo cambia `src/datos/api/generado/viajes.ts`, como autorizó el usuario.
- **Convenciones.**
  - Nombres en español y sin tildes en el código. Conventional Commits con la pieza correcta.
  - Specs 000 y 001 al día.
  - Sin secretos: los marcadores `$(env:…)` y la clave de semilla salen del entorno, y el `.env` de prueba vivió solo en el scratchpad.

## Mal cerrados de la pasada 1

| Id | Estado | Nota |
|---|---|---|
| R1B-1, R1B-2 (PB-5) | Bien cerrado | 8691730, tal como lo pedía la decisión. Probado en el Keycloak descartable |
| R1B-3 | Bien cerrado | La prueba se renombró; 32/32 |
| R1B-4 | Bien cerrado | ad309a9, aunque en un commit con otra pieza (R2B-5) |
| R1B-5 | Bien cerrado | ad309a9, con su prueba |
| R1B-8 | Sin hacer (era opcional) | R2B-6 |
| **R1B-9** | **Mal cerrado** | 048b0f9 agrega la comprobación pedida, pero rompe Spotless y deja la CI de la rama en rojo (R2B-1) |
| 5b `choferId` (pasos 1 a 3) | Bien cerrado | Falta publicar la rama y abrir el PR (paso 4). Los pasos 5 a 7 van en el front, después del merge |
| 5b `unidadId` | Bien cerrado sin contrato | 596ed14 en el front; ninguna rama del backend toca `analitica.yaml` |
| Paso 6 de PB-5 (aplicar el realm en local) | Pendiente del usuario | R2B-7 |

## CI por rama

Qué jobs dispara cada rama según los `paths-filter` de `ci.yml`, y cómo quedarían:

| Rama | Jobs que corren | Resultado esperado |
|---|---|---|
| `fix/plataforma/rol-interno-portal` | `viajes`, `finanzas`, `keycloak`, `gitleaks`, `commitlint` | **Rojo hasta R2B-1**: `viajes` cae en `spotless:check`. Lo demás en verde (Finanzas 70/70; Keycloak 32/32 en limpio y al actualizar) |
| `fix/analitica/semilla-fechas` | `analitica`, y además `viajes`, `flota` y `finanzas`, porque `plataforma/semilla/**` está en sus filtros; `gitleaks`, `commitlint` | Verde. Analítica 71/71. Viajes, Flota y Finanzas tienen el mismo código que `develop` |
| `test/flota/aislar-broker` | `flota`, `gitleaks`, `commitlint` | Verde (69/69) |
| `feat/gateway/enlaces-fichas` | `contratos`, `viajes`, `gateway`, `portal`, `centro-control`, `app-chofer`, `gitleaks`, `commitlint` | Verde en lo que corrí. Sin correr: build y Storybook del portal, `verificar` de centro-control y `empaquetar` de app-chofer (riesgo bajo) |

## Orden de merge y conflictos

**Simulación.** En un worktree temporal desde `origin/develop` hice `git merge --no-commit --no-ff` de cada rama, en este orden: plataforma → flota → analitica → gateway → ui-comun (06a3507). **No hubo conflictos.**

- Hay un solo archivo compartido, `plataforma/scripts/README.md`, entre plataforma y analitica, en hunks distintos. Después de los merges, las dos líneas quedan bien (`--profile ia` y "nunca las cuentas de servicio").
- La rama ui-comun avanzó a c587417 mientras revisaba. Con `git merge-tree` también sale limpia contra las cuatro ramas.
- Lo que el worktree `web-ux` tiene sin commitear (`DESIGN.md`, `viaje.ts` y `viaje.spec.ts` de cc-operaciones) no entró en la simulación.
- **Árbol ya mergeado:**
  - `generar:verificar` de centro-control sin diferencias;
  - `generar:contratos:verificar` del portal sin diferencias;
  - `verificar` del portal 54/54.

**Orden recomendado.** Ninguna rama está publicada. Cada una se publica con `git push -u origin <rama>` y va con su PR a `develop`.

1. **`fix/plataforma/rol-interno-portal`**, después de R2B-1. Va primero porque es la de seguridad. Después del merge: aplicar el realm en local (R2B-7).
2. **`test/flota/aislar-broker`**. Así ninguna corrida de pruebas posterior manda eventos al RabbitMQ local.
3. **`fix/analitica/semilla-fechas`**. Entra limpia sobre 1. Después, en local: `up -d --build --profile ia` y `cargar.sh`.
4. **`feat/gateway/enlaces-fichas`**. Va antes del front, para que el paso 5 de 5b salga de un `develop` que ya tenga el contrato.
5. **`feat/ui-comun/arreglos-ux-web`**. Al final, porque su verificación en el navegador (cuenta interna en el portal, FB-7 con la semilla) necesita 1 y 3 aplicadas. Antes del PR hay que commitear lo que tiene sin commitear y traer `develop`.
6. **Después**, una rama nueva desde `develop`, por ejemplo `feat/cc-operaciones/enlace-ficha-chofer`, para el paso 5 de 5b: `npm run generar`, el enlace con `urlEnApp(..., 'cc-flota', '/choferes/' + id)` y borrar la fila 76 de `pendientes-frontend-web.md` (R2B-8).

Ningún orden produce conflictos de texto. Si GitHub exige que la rama esté al día con `develop`, cada PR volverá a correr su CI después del merge anterior.

## Veredicto

- **`fix/plataforma/rol-interno-portal`: aprobada con un cambio obligatorio.** R2B-1 (Spotless) antes del PR. R2B-2 se recomienda; R2B-6 es opcional. En seguridad no hay regresiones: probé el rol `interno`, FGAP, el intercambio de tokens, D27 y PB-5 en un Keycloak real.
- **`fix/analitica/semilla-fechas`: aprobada.** R2B-5 es opcional.
- **`test/flota/aislar-broker`: aprobada.**
- **`feat/gateway/enlaces-fichas`: aprobada.** R2B-3 y R2B-4 son opcionales.
- **Merge:** sin conflictos, en el orden de arriba.
