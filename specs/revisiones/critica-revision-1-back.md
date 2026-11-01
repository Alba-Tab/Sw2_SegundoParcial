# Revisión 1: backend y plataforma (PB-1 a PB-3, decisión PB-5)

Revisor: pasada 1, solo lectura. Fecha: 01-11-2026.

Ramas revisadas (las tres salen de `origin/develop`, sin solaparse en archivos entre sí ni con `feat/ui-comun/arreglos-ux-web`):

- `fix/plataforma/rol-interno-portal`: 432f98c, b0c702f, e2c83b1, 471265e, f0ef0c8
- `fix/analitica/semilla-fechas`: d53f4f2, 802eecf
- `test/flota/aislar-broker`: eb08031

## Pruebas corridas (en copias de `/private/tmp/claude-501/rev1-*`, ya borradas)

| Pieza | Qué | Resultado |
|---|---|---|
| Viajes | `./mvnw verify -Dit.test=ClientesIT -Dtest=ArquitecturaTest` (Testcontainers) | 8/8 ClientesIT y 3/3 ArchUnit en verde |
| Finanzas | `pest tests/Feature/AuditoriaTest.php` con un PostgreSQL propio (no el del compose), `pint --test`, `deptrac`, `phpstan` | 2/2 en verde; Deptrac 0 violaciones; Larastan sin errores. Los avisos de Pest son por el `.env` que falta en la copia, no por la rama |
| Analítica | `pytest tests/test_demo.py`, `ruff check`, `ruff format --check`, `lint-imports` | 2/2 en verde; lint limpio; contratos de capas 2/2 |
| Flota | `jest --selectProjects integracion test/integracion/reservas.spec.ts`, `tsc --noEmit`, `prettier --check` | 17/17 en verde; tipos y formato limpios |

Las dos pruebas nuevas fallarían sin su arreglo: el token `["interno"]` daba 201 en ClientesIT, y en AuditoriaTest `['interno','administracion']` guardaba `interno` con `roles[0]`. No corrí `probar-realm.sh` porque no se aplica nada a Keycloak. Sí hice dos GET de solo lectura al Keycloak local para confirmar PB-5 (ver abajo).

## Hallazgos

| Id | Sev. | Rama | Archivo:línea | Problema | Arreglo |
|---|---|---|---|---|---|
| R1B-1 | **P1** | `fix/plataforma/rol-interno-portal` (PB-5) | `plataforma/scripts/reiniciar-demo.sh:46-48` (en `develop`) | `reiniciar-demo.sh` **borra a todos los miembros** de `registro-portal`. Hoy ese grupo tiene a `service-account-analitica` (confirmado por GET: es el único miembro y se creó el 29-10, después que las otras tres cuentas de servicio). PB-3 pide al usuario correr `reiniciar-demo.sh`: eso borraría la cuenta de servicio de Analítica | Ver la decisión PB-5. **No correr `reiniciar-demo.sh` hasta aplicar PB-5 en local** |
| R1B-2 | P2 | `fix/plataforma/rol-interno-portal` (PB-5) | `plataforma/keycloak/configurar-api.sh:23-27` | Solo saca del grupo a los usuarios de semilla. Una cuenta de servicio creada después de `defaultGroups` entra en `registro-portal`, y el FGAP `viajes-miembros-registro` le da a Viajes `view-members` y `manage-members` sobre ella | Ver la decisión PB-5 |
| R1B-3 | P3 | `fix/plataforma/rol-interno-portal` (PB-5) | `plataforma/keycloak/probar-realm.sh:36` | La prueba ya cuenta todos los miembros (y hoy falla en local por R1B-2), pero su nombre dice "sin usuarios de semilla" | Renombrarla a `"registro-portal vacío (sin semilla ni cuentas de servicio)"` |
| R1B-4 | P3 | `fix/analitica/semilla-fechas` | `plataforma/scripts/README.md:9` (sin tocar) y `plataforma/semilla/cargar.sh:13` | "Antes de empezar" levanta con `--build` sin `--profile ia`. `compose run` solo construye la imagen de Analítica si no existe. Con una imagen vieja, `cargar.sh` corre el `demo.py` anterior (`on_conflict_do_nothing`) y PB-2 parece no arreglado | Agregar `--profile ia` a ese `up -d --build` del README de scripts (una línea), o anotar en `cargar.sh` que antes hay que construir `analitica` |
| R1B-5 | P3 | `fix/analitica/semilla-fechas` | `servicios/analitica/app/demo.py:119-137` | La semilla de `HechoViaje` sigue con `do_nothing`. Al recargar, `fecha_viaje` y `terminado_en` de los 3 viajes de la semilla no se mueven, mientras que Finanzas sí mueve `fecha_viaje` y Analítica sí mueve la factura. Rentabilidad (`reportes.py:225`, por `terminado_en`) deja esos viajes en días viejos | Opcional, en la misma rama: pasar `("fecha_viaje", "terminado_en")` a ese `upsert`. No bloquea PB-2 |
| R1B-6 | Obs. | `fix/analitica/semilla-fechas` | `servicios/analitica/app/demo.py:154` | El estado se deriva como `PAGADA` o `EMITIDA`; Finanzas además usa `PAGADA_PARCIAL`. Hoy las 3 facturas de la semilla tienen saldo = monto, así que no hay diferencia | Ninguno ahora. Si la semilla gana una factura parcial, usar la misma regla que `CargarSemilla.php:48` |
| R1B-7 | Obs. | `fix/analitica/semilla-fechas` | `demo.py:155-159` | Al recargar se reinician `saldo` y `estado` de las 3 facturas de la semilla aunque un `PagoRegistrado` real las haya cambiado; las filas de `hecho_pago` quedan. Finanzas hace lo mismo (`CargarSemilla.php:55`), así que las dos bases siguen iguales. El Inbox salta los eventos ya procesados y un pago nuevo se aplica bien (`saldo > nuevo`). Solo toca las filas con ids de la semilla; los sintéticos y las facturas reales no cambian | Aceptado. El reinicio limpio sigue siendo `reiniciar` |
| R1B-8 | Obs. | `fix/plataforma/rol-interno-portal` | `servicios/finanzas/app/Infraestructura/Persistencia/AuditoriaDb.php:21` | `$quien->roles ?? []` usa otro estilo que `$quien?->sub` en la misma línea. No falla: `??` no avisa con `null` | Opcional: `$quien?->roles ?? []` |
| R1B-9 | Obs. | `fix/plataforma/rol-interno-portal` | `servicios/viajes/src/test/java/bo/transporte/viajes/ClientesIT.java:200-208` | La prueba revisa 403 y `SIN_PERMISO`, pero no comprueba "no se crea ningún cliente" (criterio nuevo de la spec 001). Igual queda cubierto: la excepción es anterior a `guardar` y revierte la transacción | Opcional: contar `cliente` antes y después |
| R1B-10 | Obs. (fuera de alcance, anterior a esta rama) | — | `plataforma/keycloak/configurar-api.sh:47-48` | `viajes-map-roles-usuarios` da `map-roles` sobre **todos** los usuarios. Junto con `map-role` de `cliente`, Viajes puede poner `cliente` a cualquier usuario, aunque no esté en el grupo (sin poder verlo). Está documentado como límite de FGAP v2 | Anotarlo para ICONIX y seguridad; no se toca ahora |

### Lo que revisé y está bien

- **Rol `interno` (PB-1).** Keycloak cruza los roles efectivos del usuario con el *scope* del cliente, y los dos se expanden por compuestos. Resultado por caso:
  - `portal-cliente`: un interno recibe solo `interno`; un usuario recién registrado recibe nada (`default-roles-transporte` no tiene roles de realm), así que su alta sigue funcionando.
  - `cc-*`: reciben además `interno`. El Gateway (`autenticacion.ts:77`) y `ui-comun` (`sesion.ts:84`) filtran por lista cerrada; un chofer en `cc-*` recibe solo `[interno]` y sigue viendo "Sin acceso" o recibiendo 403.
  - **D27**: `interno` no es compuesto. `offline_access` sigue saliendo solo de `chofer`, y la prueba "gerente1 no recibe offline_access" no cambia.
  - **Intercambio RFC 8693** (gateway, analitica, mcp-server): el token intercambiado lleva `gerente,interno`. Ningún servicio lo usa para dar permisos: Viajes, Finanzas, Flota, Analítica y mcp-server autorizan por lista cerrada. En Analítica, `Usuario.rol` y el filtro de `obtener_archivo` siguen bien.
  - **Agente**: `agente_lectura` no es compuesto, así que su token no recibe `interno`.
  - **Device grant** (`demo-cli`): recibe `interno` y es inocuo.
  - **FGAP de Viajes**: `map-role` sigue limitado a `cliente` y `/role-mappings/realm/available` solo lo ofrece a él.
  - **Enum `Rol` de GraphQL**: el Gateway filtra antes, así que `interno` no llega al enum.
- **Auditoría.** Viajes (`AuditoriaJdbc`), Analítica (`Usuario.rol`) y mcp-server (`rolDe`) ya elegían el rol por lista, así que `interno` nunca llega a `actor_rol`. Finanzas era el único con `roles[0]`, y e2c83b1 lo corrige con orden determinista. Deptrac queda limpio.
- **403 `SIN_ALTA`.** `interno` entra en la lista y la regla se evalúa antes del NIT y de la vinculación.
- **`cargar.sh`.** `c --profile ia run` suma los perfiles bien. `alembic upgrade head` es idempotente, y `--no-deps` funciona con `postgres-azure` arriba. El orden de D102 aplica a `reiniciar-demo.sh` (que ya corre `app.demo reiniciar`), no a una carga; poner Analítica al final está bien porque cada servicio lee sus archivos.
- **Flota (PB-3).** `reservas.spec.ts` ahora usa un RabbitMQ de Testcontainers, igual que `flota.spec.ts`; son las dos únicas pruebas que levantan módulos.
- **Convenciones.**
  - Nombres en español y sin tildes en el código.
  - Conventional Commits con la pieza correcta.
  - Ningún cambio en `contratos/`.
  - Sin secretos: solo marcadores `$(env:…)`, y la clave de semilla sale del entorno.
  - Ningún commit lleva `Co-Authored-By`, `Signed-off-by` ni "Generated with".
  - Spec 000 y spec 001 están al día.
- **Flujos.**
  - 001 (alta, también la del recién registrado): no se rompe.
  - 006 y 008: solo cambia `actor_rol` de Finanzas, para mejor.
  - 013: las alertas no dependen de la semilla de facturas.
  - 016: el Gateway filtra `interno`.

## Decisión PB-5

**Veredicto: sí se arregla en la plataforma, en `configurar-api.sh`, pero no con un filtro por prefijo, y se suma una defensa en `reiniciar-demo.sh`. No se toca `VinculadorKeycloak` ni el FGAP.**

Por qué:

1. **La causa está en el grupo, no en Viajes.** Keycloak mete en los `defaultGroups` a todo usuario nuevo, incluida la cuenta de servicio de un cliente al que se le activa `serviceAccountsEnabled` después del primer import. Por eso solo cayó `service-account-analitica`: creada el 29-10; `gateway`, `agente` y `viajes` son del 27-10. Si `VinculadorKeycloak` ignora las cuentas de servicio, el permiso FGAP no cambia: el token de `viajes` sigue pudiendo leer y modificar esa cuenta por la API de administración. Además, en FGAP v2 no hay una política que excluya cuentas de servicio sin escribir una extensión.
2. **Sacarlas por id exacto y no por `service-account-*`.** `registrationEmailAsUsername` es `false`, así que una persona puede registrarse con el usuario `service-account-x`. Con los ids exactos, que vienen de `/clients/{id}/service-account-user`, nunca se toca a un usuario real.
3. **Defensa en `reiniciar-demo.sh`, porque ahí se borra.** Ese script borra a todos los miembros del grupo (R1B-1). Si mañana otra cuenta de servicio entra al grupo antes de que alguien corra `configurar-api.sh`, la demo no debe borrarla. En este punto filtrar por prefijo sirve, porque falla del lado seguro: en el peor caso un usuario llamado `service-account-x` sobrevive al reinicio.

**Rama:** `fix/plataforma/rol-interno-portal`, como un commit aparte. Ya toca `probar-realm.sh` y el README de Keycloak justo al lado, y PB-1 y PB-5 son el mismo tema: quién entra a `registro-portal` desde el portal. Con una rama aparte, los dos chocarían en las mismas líneas.

Pasos exactos:

1. `plataforma/keycloak/configurar-api.sh`, después del `for` de la línea 25-27:

   ```bash
   # Las cuentas de servicio creadas después de defaultGroups también caen en registro-portal (PB-5): fuera, por id exacto.
   for cl in $(api "$A/clients?max=200" | jq -r '.[] | select(.serviceAccountsEnabled == true) | .id'); do
     api -X DELETE "$A/users/$(api "$A/clients/$cl/service-account-user" | jq -r .id)/groups/$GRUPO" >/dev/null 2>&1 || true
   done
   ```

   Y en el comentario del encabezado (paso 2): "…usuarios de semilla con ids fijos; ni ellos ni las cuentas de servicio quedan en registro-portal".
2. `plataforma/scripts/reiniciar-demo.sh:47`: cambiar el `print` del `python3 -c` para que salte las cuentas de servicio:

   ```bash
   | python3 -c 'import json,sys; print(" ".join(u["id"] for u in json.load(sys.stdin) if not u.get("username","").startswith("service-account-")))'); do
   ```

3. `plataforma/keycloak/probar-realm.sh:36`: renombrar la prueba a `"registro-portal vacío (sin semilla ni cuentas de servicio)"`. La aserción (`jq length` = 0) no cambia.
4. `plataforma/keycloak/README.md`: en la fila de `configurar-api.sh`, agregar "y saca del grupo `registro-portal` a los usuarios de semilla y a las cuentas de servicio". En `plataforma/scripts/README.md`, en el paso (4) de `reiniciar-demo.sh`, agregar "(nunca las cuentas de servicio)".
5. Commit: `fix(plataforma): saca las cuentas de servicio del grupo registro-portal`, sin coautoría.
6. **El usuario, en local** (el revisor no aplica nada): `plataforma/keycloak/aplicar-realm.sh plataforma/compose/.env`, luego `probar-realm.sh` (32 pruebas en verde, incluida la del grupo vacío). **Solo después** correr `reiniciar-demo.sh` para borrar la alerta vieja de PB-3.

## Orden de merge

Ninguna de estas ramas comparte archivos con las otras ni con `feat/ui-comun/arreglos-ux-web`, así que el orden no responde a conflictos sino a riesgo y a qué hace falta para verificar.

1. **`fix/plataforma/rol-interno-portal`** con el commit de PB-5. Va primero porque es la de seguridad (P1). Antes de que entre el front, el portal ya funciona: un gerente ve el formulario de empresa y recibe 403 `SIN_PERMISO` en vez de crear un cliente. Al mergearla hay que reaplicar el realm en local, y más adelante en cada nube.
2. **`test/flota/aislar-broker`**. Así ninguna corrida de pruebas posterior vuelve a meter eventos en el RabbitMQ local.
3. **`fix/analitica/semilla-fechas`**. Después, en local: construir `analitica` (R1B-4), correr `cargar.sh` o `reiniciar-demo.sh` (este último solo después del paso 6 de PB-5), y verificar que `factura.vence_el` = `hecho_factura.vence_el`.
4. **`feat/ui-comun/arreglos-ux-web`**. Al final, porque su verificación en el navegador (Cuenta interna en el portal, FB-7 con la semilla) necesita las tres ramas anteriores aplicadas.

## Veredicto

- `fix/plataforma/rol-interno-portal`: **aprobada con cambios**. PB-1 está correcto y sin regresiones en el intercambio de tokens, FGAP, device grant ni D27. Antes del merge hay que sumar el commit de PB-5 (R1B-1 a R1B-3). R1B-8 y R1B-9 son opcionales.
- `fix/analitica/semilla-fechas`: **aprobada**. R1B-4 (una línea de documentación) se recomienda antes del merge; R1B-5 es opcional.
- `test/flota/aislar-broker`: **aprobada** sin cambios.
