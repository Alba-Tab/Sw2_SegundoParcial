# Informe de la vuelta 1: faltantes de `pendientes.md`

Fecha: 01-11-2026. La vuelta 2 lee este archivo y corrige lo que dice la sección 4. Cuando todo quede resuelto, el archivo se borra; lo que siga abierto pasa a `specs/pendientes.md`.

## 1. Ramas (locales, sin push)

| Rama | Commits | Qué resuelve |
|---|---|---|
| `docs/specs/decision-d60-fatiga-y-entrega` | 2 | D60 cambiada, D106 y D107; specs 005, 006, 007 y 010; `pendientes.md` |
| `fix/plataforma/gerente-consola-y-portal` | 2 | B7: `realm-management` para el gerente (ver F1-1) |
| `fix/app-chofer/decisiones-fatiga-entrega` | 6 | Fatiga sin GPS, SIN_ROSTRO a más de 5 km/h, reintento de FALLIDA, C-8, C-18 y A-21 (worklets 0.10.1) |
| `feat/finanzas/ajuste-linea-credito` | 7 | G6 (ajuste y suspensión, `LIMITE_MENOR_QUE_USADO`), B4 (extensiones de error) y B5 (líneas por lotes) |
| `feat/flota/gestion-flota` | 4 | G1 (alta, edición y baja de unidades), G3 (licencia y habilitación de choferes), `chofer(id)`, cursor en choferes y mantenimientos, y enlace al chofer desde el viaje |
| `feat/viajes/gestion-rutas-clientes` | 6 | B3 (orden de los viajes), G4 (rutas con `RutaActualizada`), G7 (edición de clientes con `ClienteActualizado`), `cliente(id)`, `ruta(id)` y cursor en clientes |
| `chore/repo/integracion-vuelta-1` | merges | Junta las seis para probar. **No se publica** |

## 2. Verificación sobre la integración (resultados reales)

Pasan:
- **Contratos:** AsyncAPI con 20 canales, GraphQL con 85 tipos y 24 mutaciones con clave.
- **Viajes:** 40 unitarias, 51 de integración y Spotless.
- **Flota:** 71 pruebas.
- **Finanzas:** Pest con 78 pruebas, Deptrac y PHPStan.
- **Gateway:** 39 pruebas.
- **Centro de Control:** 268 pruebas, y build de las 4 apps.
- **Portal:** 55 pruebas.
- **App:** 65 pruebas.
- **Analítica:** 70 pruebas.

Solo hubo un conflicto, en los imports de `resolvers.ts`. Para correr Testcontainers con OrbStack hace falta `DOCKER_HOST=unix:///Users/alba/.orbstack/run/docker.sock`.

## 3. Flujos de punta a punta (stack local reconstruido desde la integración)

| Flujo | Resultado |
|---|---|
| Rutas: crear, editar, reenviar, y el evento en Finanzas y Analítica | Pasa (ver F1-2) |
| Clientes: editar, NIT repetido → 409, y el evento | Pasa |
| Unidades: alta, documentos, baja → INACTIVA y no se reserva | Pasa |
| Choferes: licencia, sin motivo → 400, con reserva → 409, inhabilitado no se asigna | Pasa |
| Línea de crédito: bajo lo usado → 409, suspendida → saga `CREDITO_RECHAZADO`, reactivar | Pasa |
| B4: `pagoId` y `saldo` en `extensions` | Pasa |
| Listas por id y orden de los viajes | Pasa. El tope de 100 no se probó porque no hay datos suficientes |
| Roles: las 11 mutaciones y los 15 endpoints con el rol equivocado, y el filtro por cliente | Pasa |
| Finanzas caída → respuesta parcial con `DEPENDENCIA_NO_DISPONIBLE` | Pasa |
| Keycloak (D103) | **Falla** (F1-1) |
| UI en el navegador | No probada: el login se sirve en `MacBook-Air-de-Brayan.local` (emisor fijo), no en localhost, y no había servidores de desarrollo levantados |

Restos de prueba en la base local: la ruta «Santa Cruz – Montero (prueba F1)» inactiva, la cisterna 9499TST INACTIVA, un pago de 1 BOB (`PRUEBAF1-8980`) y 3 servicios cancelados. `reiniciar-demo.sh` los limpia.

## 4. Hallazgos para la vuelta 2

### Decisiones (antes de arreglar)

| id | Sev | Tema | Recomendación |
|---|---|---|---|
| F1-1 / E1-1 | P1 | El gerente, con `manage-users`, se dio `cliente`, `administracion` y `chofer`, le dio `administracion` a otro y se escribió el `clienteId` de otra empresa. Finanzas le mostró la línea de crédito de esa empresa. Además, esos roles viajan en los tokens de las apps `cc-*` | Grupo `administra-usuarios`, sin `manage-users`, con `query-users`, `query-groups` y `view-realm`. FGAP v2 con la política `es-gerente`: `manage-members` y `view-members` sobre el grupo `personal-interno`, y `map-role` solo para los roles operativos. `clienteId` no editable por el admin. Pruebas de los casos de arriba en `probar-realm.sh` |
| F1-2 / E4-1 | P2 | Una ruta nueva se muestra en el portal pero no tiene tarifa (D10 y D107): la cotización da 400 VALIDACION | Una ruta nueva nace **inactiva** y el formulario avisa que hace falta su tarifa de semilla. El portal da un mensaje propio («Esta ruta todavía no tiene tarifa»). Anotarlo en las specs 002 y 010 |
| E5-1 | P2 | Las listas que siguen el cursor (hasta 20 páginas en 3 s) fallan completas con más de 2.000 registros o con una página lenta | Devolver lo que alcanzó con un aviso, en vez de `null`; `mantenimientos` sin filtro solo trae los EN_CURSO y los de los últimos 90 días |
| E11-1 | P3 | La app también libera el INICIO FALLIDA, y D106 habla solo de entrega y rechazo. Con un 409 porque el servidor ya lo tiene EN_RUTA, la app vuelve a CONFIRMADO y apaga el GPS | Ampliar D106 al INICIO, salvo `CONFLICTO_ESTADO`: con ese código no se libera y se descarga el estado del viaje |

### Arreglos sin decisión

| id | Sev | Rama | Qué hacer |
|---|---|---|---|
| E2-1 | P2 | app-chofer | Con `speed < 0`, calcular la velocidad con la distancia y el tiempo entre las dos últimas lecturas. Si la lectura tiene más de 10 s, la velocidad es desconocida; con el viaje EN_RUTA y la velocidad desconocida, cuenta como en marcha. Agregar una prueba con `-1` |
| E3-1 | P2 | app-chofer | Sumar las alertas sin posición a `sinEnviar` y nombrarlas en el diálogo de cierre de sesión |
| E12-1 | P3 | app-chofer | Encolar una alerta guardada solo con una lectura del mismo viaje; si no, usar la última posición guardada de ese viaje |
| E6-1 | P3 | flota | `z.string().trim().min(3)` en el nombre y el motivo, para que no termine en un 500 del Outbox |
| E7-1 | P3 | flota | `motivoInhabilitacion` en null si está activo; la CLI limpia `inhabilitacion` al activar |
| E8-1 | P3 | flota | Con una reserva activa, no dejar la licencia en algo distinto de C vigente: 409 |
| F1-3 | P3 | flota | Habilitar a un chofer que ya está activo (o inhabilitar a uno inactivo): 409 `CONFLICTO_ESTADO`, sin evento |
| F1-4 | P3 | flota y viajes | Mensajes de validación en español (zod y Bean Validation) |
| E9-1 | P3 | viajes | `CREDITO_RECHAZADO` en el `noReintentar` del stub de Finanzas, con `Workflow.getVersion` si cambia la lógica |
| E10-1 | P3 | viajes | En la fachada de rutas, `refetch().catch(() => undefined)` después de crear o editar, para no duplicar con otra clave |
| E13-1 | P3 | finanzas | Quitar el aviso «primeros 100 clientes» de Líneas de crédito |
| — | P3 | operaciones | La ficha de cliente pide `suspendida` y muestra «Suspendida» (hoy dice «Al día») |
| — | P3 | flota | El mínimo de capacidad es 0,1 t en el front y cualquier valor mayor que 0 en Flota: dejar el mismo en los dos |
| — | P3 | flota | La app regeneró `generado/flota.ts`: ese commit va en la rama de flota |

### Documentación (contradicciones con las fuentes de verdad)

- **Spec 016:** agregar a la lista de mutaciones con clave (§11) y a la tabla de roles `crearUnidad`, `editarUnidad`, `darDeBajaUnidad`, `editarChofer`, `cambiarHabilitacionChofer`, `crearRuta`, `editarRuta` y `editarCliente`, y las consultas `chofer`, `cliente` y `ruta`.
- **D107:** se edita la licencia **y el nombre**. Decirlo así en D107 y en la spec 010.
- **Spec 005:** el detector es MediaPipe Face Landmarker, no «un modelo TFLite».
- **Spec 001:** editar el correo no cambia el de Keycloak (D103, sin Admin API).
- **`pendientes.md`:** marcar como hechos G1, G3, G4, G6, G7, B1 a B5, B7 y el enlace al chofer. Dejar B6, B8 y lo que quede abierto aquí.

## 5. Lo que no se probó

- La UI en el navegador: hace falta que Keycloak se sirva en localhost o que el usuario inicie sesión.
- El tope de las listas con muchos registros.
- La app del chofer en un dispositivo: el loop de la alarma, `InputAccessoryView`, worklets 0.10.1 en un build nativo y la velocidad real del GPS.
