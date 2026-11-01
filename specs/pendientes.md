# Pendientes

Lo que quedó abierto al cerrar las iteraciones de UX del 31-10 y 01-11-2026 (app del chofer, Centro de Control y portal). Las decisiones que salieron de ellas están en `decisiones.md` (D60, D103, D104); los planes y las revisiones de esas iteraciones se borraron al fusionarlas.

## 1. Backend para la gestión de datos maestros (D104)

El front ya tiene en modo lectura todo lo que el Gateway permite: Mantenimientos y Choferes (con ficha) en `cc-flota`, avisos de documentos vencidos en Unidades, Clientes y Rutas (con ficha) en `cc-operaciones` y Líneas de crédito en `cc-finanzas`. Las escrituras de abajo **no tienen botón** hasta que exista su mutación. Cada una va "contratos primero": OpenAPI y `contratos/graphql/centro-control.graphql` en el mismo commit que el resolvedor y la pantalla.

Convención propuesta: la mutación recibe `claveIdempotencia: ID!`, el Gateway la reenvía como `Idempotency-Key` (igual que `cancelarServicio` o `programarMantenimiento`) y responde el objeto actualizado para que Apollo refresque su caché.

| Acción | Mutación GraphQL propuesta | Input | Respuesta | Roles | REST en el servicio |
|---|---|---|---|---|---|
| Alta de unidad (G1) | `crearUnidad(input: UnidadNuevaInput!)` | `tipoUnidad`, `placa`, `tipoRemolque`, `capacidadToneladas`, `kilometraje` (odómetro del tracto; `UnidadNueva` en `flota.yaml` ya lo acepta), `kmDesdeUltimoMantenimiento`, `documentos: [DocumentoInput!]!`, `atributos: JSON`, `claveIdempotencia` | `Unidad!` | jefe_flota | **Existe:** `POST /api/v1/unidades` (Flota, con `Idempotency-Key`) |
| Edición de unidad y de sus documentos (G1, G2) | `editarUnidad(input: UnidadEdicionInput!)` | `unidadId`, `capacidadToneladas`, `documentos`, `atributos`, `claveIdempotencia` | `Unidad!` | jefe_flota | **Existe:** `PUT /api/v1/unidades/{unidadId}` (con `Idempotency-Key`) |
| Baja de unidad (G1) | `darDeBajaUnidad(unidadId: ID!, motivo: String!, claveIdempotencia: ID!)` | motivo de 3 o más caracteres | `Unidad!` (queda `INACTIVA`, final) | jefe_flota | **Existe:** `POST /api/v1/unidades/{unidadId}/baja` |
| Alta de chofer (G3) | `crearChofer(input: ChoferNuevoInput!)` | `nombre`, `usuarioSub` (usuario de Keycloak con rol `chofer`), `licenciaCategoria` (A, B, C), `licenciaVenceEl`, `claveIdempotencia` | `Chofer!` | jefe_flota | **Falta:** `POST /api/v1/choferes` en Flota (hoy solo `GET`). Falta decidir cómo se obtiene `usuarioSub` (el usuario se crea en la consola de Keycloak, D103) |
| Edición de chofer y renovación de licencia (G3) | `editarChofer(input: ChoferEdicionInput!)` | `choferId`, `nombre`, `licenciaCategoria`, `licenciaVenceEl`, `claveIdempotencia` | `Chofer!` | jefe_flota | **Falta:** `PUT /api/v1/choferes/{choferId}` |
| Habilitar o inhabilitar chofer (G3) | `cambiarHabilitacionChofer(choferId: ID!, activo: Boolean!, motivo: String, claveIdempotencia: ID!)` | motivo obligatorio al inhabilitar | `Chofer!` | jefe_flota | **Falta:** `POST /api/v1/choferes/{choferId}/habilitacion`. Regla a definir: no inhabilitar con una reserva activa (`disponible = false`) |
| Alta y edición de ruta (G4) | `crearRuta(input: RutaInput!)`, `editarRuta(rutaId: ID!, input: RutaInput!)` | `nombre`, `origen: LugarInput!`, `destino: DestinoInput!`, `distanciaKm`, `activa`, `claveIdempotencia`; `LugarInput { nombre, coordenadas: CoordenadasInput! }` y `DestinoInput` igual más `radioMetros: Int!` (50 a 5000), como `Lugar` en `viajes.yaml` | `Ruta!` | gerente, despachador | **Falta:** `POST /api/v1/rutas` y `PUT /api/v1/rutas/{rutaId}` en Viajes (hoy solo `GET`). Publica `RutaActualizada` por Outbox. `Ruta` en GraphQL debería exponer `activa` y `destino.radioMetros` |
| Ajuste de línea de crédito (G6) | `ajustarLineaCredito(clienteId: ID!, limite: Dinero!, motivo: String!, claveIdempotencia: ID!)` | límite en texto decimal (sin float). Sin `version`: la línea se cambia con `FOR UPDATE` (000 §9, PR #99) | `LineaCredito!` | administracion, gerente | **Falta:** `PUT /api/v1/lineas-credito/{clienteId}` en Finanzas. Invariante: el límite no baja de `reservado + utilizado` |
| Suspender o reactivar línea (G6) | `cambiarEstadoLineaCredito(clienteId: ID!, suspendida: Boolean!, motivo: String!, claveIdempotencia: ID!)` | | `LineaCredito!` | administracion, gerente | **Falta:** endpoint y campo de estado en `LineaCredito` (hoy solo `enMora`) |
| Edición de cliente desde el Centro de Control (G7) | `editarCliente(clienteId: ID!, input: ClienteEdicionInput!)` | `razonSocial`, `nit`, `correo`, `claveIdempotencia` | `Cliente!` | comercial, gerente | Alta: **existe** `POST /api/v1/clientes` en Viajes. Edición: **falta** `PUT /api/v1/clientes/{clienteId}` |
| Tarifas (G5) | `tarifas(rutaId: ID)` (query) y `guardarTarifa(input: TarifaInput!)` | `rutaId`, `tipoCarga`, `precioPorTonelada: Dinero!`, `vigenteDesde: Fecha!`, `claveIdempotencia` | `Tarifa!` | administracion, gerente | **Falta todo:** no hay endpoint ni agregado en Finanzas. Necesita spec y una decisión frente a D10/D102 (tarifas de semilla). La pestaña va en `cc-finanzas` (TODO en `seccion.ts`) |

**Lecturas por id que faltan en el esquema:** `chofer(id)`, `cliente(id)` y `ruta(id)`. Hoy cada ficha pide la lista y busca el id en el navegador; los `GET /{id}` ya existen en Flota y Viajes.

## 2. Backend y plataforma

| Qué | Efecto hoy | Arreglo |
|---|---|---|
| **Tope de 100 sin cursor.** `clientes`, `choferes` y `mantenimientos` se resuelven con `limite: LIMITE_MAXIMO` = 100 (`servicios/gateway/src/graphql/limites.ts`) y el Gateway no sigue el cursor | Desde el registro 101 las listas quedan truncadas y la ficha de un registro más allá del 100 no se encuentra. El front lo dice («Se muestran los primeros 100…») | Paginación por cursor en esas tres consultas (`pagina { items, siguienteCursor }`) y las lecturas por id de la sección 1 |
| **Viajes devuelve los 80 más antiguos.** `ViajeRepositorioJdbc.listar` ordena por `viaje_id` ascendente (UUIDv7, o sea por fecha de alta) | Con más de 80 viajes sin filtro de estado, los nuevos no llegan. El front lo dice | `ORDER BY v.viaje_id DESC` (como `ServicioRepositorioJdbc`) o el cursor `despuesDe` en GraphQL. Con el primero, el aviso de `viajes.ts` pasa a `corte="recientes"` |
| **El Gateway no reenvía todas las extensiones del error.** `ClienteServicio` (`servicios/gateway/src/servicios.ts`) solo pasa `codigo`, `status`, `servicio` y `errores` | Se pierden `pagoId` de `PAGO_DUPLICADO` y `saldo` de `PAGO_EXCEDE_SALDO` (spec 008); el front los suple con la factura recargada | Reenviar el resto del Problem Details (sin `type`, `title`, `detail` ni `instance`) |
| **Líneas de crédito de todos los clientes.** El DataLoader hace una llamada a Finanzas por cliente | Con el tope de 100 son 101 llamadas, dentro del presupuesto de 200. Con cursor se agotaría y las líneas saldrían en `null` | `GET /api/v1/lineas-credito?clienteIds=…` en Finanzas o una query `lineasCredito` paginada |
| **Alcance del gerente en la consola (D103), para decidir.** `gerente` es compuesto de `realm-management: [view-users, manage-users, query-groups, view-realm]` | No puede darse roles de administrador del realm ni impersonar, pero con `manage-users` puede darse a sí mismo o a otros cualquier rol del realm (`administracion`, `cliente`, `agente_lectura`, `gerente`), editar `clienteId` y cambiar contraseñas. Esos roles llegan también en los tokens de `cc-*` y de los intercambios (compuestos del *scope*), así que un token robado de un gerente administra usuarios | Sacar los roles de `realm-management` de `gerente` a un grupo `administra-usuarios` (fuera de todo *scope*, solo llegan a `security-admin-console`) y cambiar `manage-users` por permisos FGAP v2 de una política `es-gerente`: `manage` y `map-roles` sobre usuarios y `map-role` solo en `despachador`, `jefe_flota`, `administracion`, `comercial` y `chofer` |
| **Viajes corta en los 3 s del Gateway (D98).** A veces la lista llega con `DEPENDENCIA_NO_DISPONIBLE` aunque la consulta tiene índice | La pantalla conserva las últimas filas buenas con «Datos al …» y «Reintentar» | Medir con las trazas OTel (perfil `trazas` del compose) Gateway → Viajes → PostgreSQL antes de proponer un arreglo. El límite no cambia |

## 3. Centro de Control y portal

- **Enlace a la ficha del chofer desde el viaje.** `Viaje.choferId` ya está en el contrato y el Gateway. Falta en `cc-operaciones`: `npm run generar` y `urlEnApp(..., 'cc-flota', '/choferes/' + id)`, como la unidad.
- **«Volver a la app» desde una alerta** lleva a la raíz de la app de origen, no a la página. Si se quiere la página: `?desde=<app>&ruta=<path relativo>`.
- **Sin probar en el navegador:** sesiones de despachador, jefe de flota, administración, comercial, cliente y recién registrado (cubiertas por pruebas); auditoría con axe; el banner sin parpadeo al sondear con un servicio caído y el foco tras «Reintentar» en una página real.
- **Nube:** el portal no tiene build de despliegue (`_deploy-firebase.yml` es T3b.4/T11.9 y no existe). Las cuatro `VITE_*` (`VITE_OIDC_ISSUER`, `VITE_VIAJES_URL`, `VITE_FINANZAS_URL`, `VITE_CENTRO_URL`) solo están en `.env.example`; ese workflow tiene que pasarlas al `npm run build`, o el portal en la nube apunta a localhost.
- **Para revisar:** «Aprobar entrega» no pide confirmación, igual que las demás aprobaciones.

## 4. App del chofer

**A decidir (tocan D60 o el contrato):**

- **Alerta de fatiga sin GPS.** Sin ninguna posición conocida, `registrarFatiga` devuelve `null` y la alerta se pierde (el contrato exige `posicion`). Propuesta: guardarla con su `registradoEn` y encolarla con la primera posición que llegue.
- **SIN_ROSTRO con el camión detenido.** A los 3 s también salta al cargar, en un control o al mirar los espejos. Propuesta: contarlo solo con velocidad > 5 km/h (el umbral de D58).
- **Reintentar una entrega o un rechazo que terminó FALLIDA.** Hoy solo se avisa y se lleva a Pendientes; permitir registrarla de nuevo hay que confirmarlo en las specs 006 y 007.

**A verificar en un iPhone o un Android real** (el simulador no tiene cámara frontal ni entrega foto):

- Detector de fatiga: rendimiento por cuadro (tres modelos en CPU y el muestreo en JS), rostros chicos con el celular a unos 90 cm (BlazeFace de rango corto pierde el rostro por debajo del 12 % del alto), el umbral `OJO_CERRADO = 0,5` de noche y con lentes, la gorra que tapa los ojos, y que la alarma se repita sin silencios (`didJustFinish`).
- La foto de evidencia y la firma (también la ruta de `captureRef` en Android).
- La tecla «Listo» del teclado numérico en iOS (no hay `InputAccessoryView`).

**Técnicos:** `react-native-worklets` está en 0.13 y Expo 57 espera 0.10.1 (lo pide VisionCamera 5); sin gesto de borde para volver en iOS, por decisión (D105).

## 5. Para ICONIX

No se editan los `.docx` ni los `.eap`: esta lista es la entrada para actualizarlos.

**Casos de uso nuevos (lectura):**

| Caso de uso | Actor | App y pantalla | Notas para robustez |
|---|---|---|---|
| Consultar mantenimientos de la flota | jefe_flota, gerente | `cc-flota` › Mantenimientos | Búsqueda, filtro por estado y orden; enlaza a la ficha de la unidad, donde siguen «Programar» y «Cerrar» |
| Consultar choferes | jefe_flota, gerente | `cc-flota` › Choferes (lista y ficha) | Licencia con aviso de vencimiento y conducción de la semana |
| Consultar clientes | comercial, despachador, gerente | `cc-operaciones` › Clientes (lista y ficha) | Línea de crédito y últimos servicios; «Ver como cliente» abre el portal |
| Consultar rutas | despachador, gerente | `cc-operaciones` › Rutas (lista y ficha) | Origen, destino y distancia |
| Consultar líneas de crédito | administracion, gerente | `cc-finanzas` › Líneas de crédito | Límite, reservado, utilizado, disponible y estado |
| Administrar usuarios internos | gerente | Menú de usuario › consola de Keycloak | Sin pantalla propia (D103); actor externo: Keycloak |

**Casos de uso propuestos, pendientes de backend:** los de la sección 1.

**Cambios en casos de uso existentes:**

- Registrar pago (008), cancelar servicio (004), rechazar entrega observada (007), cerrar mantenimiento (010), rechazar acción del agente (014), rechazar crédito (012), y en la app registrar entrega o rechazo (006, 007): nuevo paso «el sistema muestra un resumen; el usuario confirma o vuelve». En robustez, un objeto de interfaz «Confirmación» entre el formulario y el controlador.
- Todos los formularios: curso alterno «datos inválidos: se marca cada campo y se enfoca el primero». Reemplaza al botón deshabilitado.
- Casos de uso que consultan: tres estados de error con el objeto frontera `cc-aviso-servicios`. Servicio caído: dice qué faltó, conserva lo mostrado con «Datos al …» y ofrece «Reintentar». No encontrado: solo «Volver». Sin permiso: qué no puede hacer y quién sí. «Datos al …» de Analítica pasa a aviso tras 30 minutos sin datos nuevos.
- Detector de fatiga (005, D60): estados OJOS_CERRADOS, SOMNOLENCIA, CABECEO, SIN_ROSTRO y BOSTEZOS; el evento sigue siendo `ALERTA_FATIGA` sin motivo.

**Estructura y navegación:**

- Rol de realm `interno`, sin permisos propios, compuesto de `gerente`, `despachador`, `jefe_flota`, `administracion` y `chofer`. El portal solo recibe ese rol; un usuario interno en el portal no es el actor Cliente (ve «Cuenta interna» y Viajes rechaza su alta con 403 `SIN_PERMISO`).
- Operaciones con seis pestañas: Viajes (lista y mapa), Decisiones (entregas observadas e intervenciones), Servicios, Clientes, Rutas y Acciones del agente. Las rutas viejas redirigen.
- Enlaces entre fichas de distintas apps solo por URL con `?desde=<app>`, y el destino ofrece «Volver a …». La ficha del viaje enlaza cliente, ruta y unidad; la placa de una anomalía de combustible lleva a su unidad.
- Prototipos: pestañas de `cc-tablero` (Tablero, Reportes, Pregunta por voz, Agente), encabezado con migas y «volver», página «No encontrada» en las 4 apps y el portal, y en la app del chofer las acciones del viaje en dos filas y el menú con Pendientes y Cerrar sesión.
