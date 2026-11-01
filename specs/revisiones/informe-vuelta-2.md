# Informe de la vuelta 2: corrección del informe de la vuelta 1

Fecha: 01-11-2026. La vuelta 3 (la última) lee este archivo y corrige lo de la sección 4. Al cerrar, este informe y el de la vuelta 1 se borran, y lo que siga abierto pasa a `specs/pendientes.md`.

## 1. Qué cambió en las ramas (locales, sin push)

- **Plataforma:** el gerente sale de `realm-management`. Ahora tiene el grupo `administra-usuarios` (roles de consulta), FGAP v2 con las políticas `es-gerente` y `desde-consola`, y permisos sobre `personal-interno` y sus 5 roles operativos. `probar-realm.sh` pasa con 49 pruebas.
- **App del chofer:**
  - La velocidad se estima cuando el GPS no la da, y una lectura vale 20 s.
  - Las alertas sin posición se cuentan al cerrar sesión, y cada una se encola solo con una lectura de su propio viaje.
  - Un 409 en el inicio ya no libera la marca, y el estado se baja del servidor.
- **Flota:**
  - Choferes y mantenimientos paginados por cursor.
  - Los textos se recortan antes de validar, y los mensajes salen en español.
  - Con una reserva activa, la licencia tiene que seguir siendo C vigente.
  - Repetir la habilitación o la inhabilitación da 409.
  - `motivoInhabilitacion` vale null con el chofer activo.
- **Viajes:**
  - Una ruta nueva nace inactiva, y cotizar una ruta sin tarifa da `RUTA_SIN_TARIFA` (422).
  - Clientes paginado; Servicios y Cotizaciones traen `razonSocial`.
  - `noReintentar` incluye `CREDITO_RECHAZADO`.
  - Bean Validation en español.
  - Si falla la relectura después de guardar, no se ofrece reenviar.
  - La ficha muestra «Suspendida».
- **Integración** (`chore/repo/integracion-vuelta-2`): 4 arreglos por la combinación, que todavía hay que llevar a su rama de origen.
  - `a289991` (una sola `pagina()`) → viajes.
  - `e80819d` (líneas de crédito sobre la página) → viajes.
  - `49d9e53` (prueba de complejidad) → viajes.
  - `80f1b73` (la ficha de unidad pide 50 mantenimientos, para no pasar D101) → flota.

## 2. Verificación sobre la integración

Todo pasa:

| Pieza | Resultado |
|---|---|
| Contratos | 88 tipos GraphQL |
| Viajes | 41 unitarias y 51 IT |
| Flota | 74 |
| Finanzas | 78 |
| Gateway | 41 |
| Centro de Control | 279 y el build de las 4 apps |
| Portal | 56 |
| App | 69 |
| Analítica | 70 |
| Keycloak | 49 pruebas del realm |

## 3. Flujos de punta a punta

Se repitieron los 9 flujos que se pueden probar, y pasan todos:
- **Rutas:** inactiva al nacer y `RUTA_SIN_TARIFA`.
- **Clientes.**
- **Unidades.**
- **Choferes:** el 409 por la licencia con reserva y el 409 por estado repetido, sin evento.
- **Línea de crédito:** `suspendida`, y la saga sin reintentos.
- **Extensiones de error (B4).**
- **Paginación:** 1 a 1 hasta el final sin repetidas ni perdidas; `limite:101` da `VALIDACION`; la complejidad de D101 se cumple.
- **Roles.**
- **Finanzas caída.**

**Keycloak:** el gerente ya no se da roles, no crea usuarios, no toca grupos, clientes, cuentas de servicio ni otros gerentes. Queda F2-1.

La UI sigue sin poder probarse: el login se sirve en `MacBook-Air-de-Brayan.local`.

El entorno quedó en la semilla limpia (con `reiniciar-demo.sh`) y el stack levantado.

## 4. Hallazgos para la vuelta 3

### Decisiones (antes de arreglar)

| id | Sev | Tema | Recomendación |
|---|---|---|---|
| E2-5 / F2-1 | P2 | Con el permiso `manage` sobre los internos, el gerente cambia contraseñas: podría entrar como administración y registrar pagos. También escribe `clienteId` en un interno (204), deshabilita choferes en Keycloak sin que Flota se entere y cierra sesiones | Gerente con `view` y `map-role`, **sin `manage`**. Asigna y quita los roles operativos, pero las altas, las claves y los atributos quedan en el administrador del realm. Esto cierra F2-1 y E2-5 sin tocar el perfil de usuario. Actualizar D103 |
| E2-3 | P3 | Velocidad desconocida: para SIN_ROSTRO cuenta como en marcha (D60), pero para escribir (D58) cuenta como detenido. Además, la estimación entre dos lecturas de ~1 s convierte el ruido del GPS en 10 km/h | Mantener los dos criterios a propósito: la fatiga falla del lado seguro, y la escritura no bloquea al chofer sin GPS. Anotarlo en D58 y D60. Estimar solo con lecturas separadas por 5 s o más e ignorar desplazamientos menores que la precisión |
| D108 | P3 | Las tarifas son solo de semilla, así que una ruta nueva activada siempre da `RUTA_SIN_TARIFA`, y el formulario deja activarla sin un aviso fuerte | Al activar, una confirmación que diga que sin tarifa de semilla el portal no podrá cotizarla. Aclararlo en D108 |

### Arreglos sin decisión

| id | Sev | Pieza | Qué hacer |
|---|---|---|---|
| E2-1 | P2 | app | 409 al iniciar con el viaje todavía CONFIRMADO en el servidor (por ejemplo, «otro viaje en ruta»): la app queda atascada. Después de la descarga, liberar el inicio si el servidor sigue diciendo CONFIRMADO; solo no liberarlo si ya salió de CONFIRMADO. Agregar una prueba |
| E2-2 | P2 | ui-comun, cc-flota y cc-finanzas | Si una página extra falla, que lance y conserve el cursor, con «Reintentar». Contar `filasConError` también en las páginas extra |
| E2-6 | P3 | ui-comun y cc-flota | Unificar `PaginasCursor` y `PaginasPorCursor` en `ui-comun`: deduplicar por id y, en listas ordenadas del más nuevo al más viejo, reiniciar las páginas extra cuando cambia el borde de la primera |
| E2-7 | P3 | cc-finanzas | Si gestionar una fila de una página extra falla, releer esa fila con `lineaCredito(clienteId)` |
| E2-8 | P3 | viajes y gateway | `GET /api/v1/clientes?ids=…` por lotes para `razonSocial`, como B5 |
| E2-9 | P3 | app | Una alerta guardada de un viaje que ya no está en ruta se encola con `posicionGuardada` |
| E2-10 | P3 | flota | Con una reserva activa, la licencia se valida contra la fecha del viaje reservado, no contra hoy (si Flota la conoce; si no, se anota) |
| E2-11 | P3 | viajes | En el alta de ruta, validar el rol antes que `activa` (403 antes que 400) |
| F2-2 | P3 | flota | Un cursor inválido en `choferes` y `mantenimientos` da 400 `VALIDACION`, como en clientes |
| F2-3 | P3 | viajes | `incluirInactivas` y `GET /rutas/{id}` de una ruta inactiva solo para gerente y despachador |
| F2-4 | P3 | viajes y flota | Mensajes: sin el prefijo repetido en `activa`, el NIT sin la regex, y el zod con frases propias («Debe tener al menos 3 caracteres») |
| — | P3 | integración | Llevar los 4 arreglos de integración a su rama de origen |

### Documentación

- **D104:** ya no está «en lectura»; las escrituras existen.
- **Spec 010:** el 409 por licencia con reserva y el 409 por estado repetido.
- **D106:** precisar que el 409 en el inicio solo no libera si el servidor ya no está en CONFIRMADO.
- **D103:** el alcance final según la decisión de E2-5, y que el permiso por usuario es una foto que se toma al correr `configurar-api.sh`.
- **Comentarios viejos:** `operaciones.graphql` («una llamada a Finanzas por cliente») y `paginas-cursor.ts` («nunca repite filas»).
- **Selector de clientes de Reportes** (`cc-tablero`): solo trae los primeros 100. Agregar un buscador o dejarlo en pendientes.

## 5. Lo que no se probó

- La UI en el navegador.
- Restablecer la contraseña de un interno.
- La app en un dispositivo: ritmo real del GPS, alarma, teclado de iOS y worklets 0.10.1.
