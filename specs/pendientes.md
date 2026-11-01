# Pendientes

Lo que quedó abierto al cerrar las iteraciones de UX del 31-10 y 01-11-2026 (app del chofer, Centro de Control y portal). Las decisiones que salieron de ellas están en `decisiones.md` (D60, D103, D104); los planes y las revisiones de esas iteraciones se borraron al fusionarlas.

## 1. Gestión de datos maestros (D104, D107, D108, D109)

Hecho en las ramas de la vuelta 1, sin publicar todavía (`specs/revisiones/informe-vuelta-1.md`):
- **Unidades:** alta, edición con documentos y baja.
- **Choferes:** nombre, licencia y habilitación; el alta queda en Keycloak.
- **Rutas:** alta y edición, con `RutaActualizada`; una ruta nueva nace inactiva (D108).
- **Clientes:** edición, con `ClienteActualizado`.
- **Línea de crédito:** ajuste y suspensión.
- **Consultas:** `chofer(id)`, `cliente(id)` y `ruta(id)`.
- **Gateway y viajes:** el Gateway reenvía las extensiones de error, lee las líneas de crédito por lotes y la lista de viajes trae primero los más recientes.
- **Ficha del viaje:** enlace al chofer.

En la vuelta 2: paginación por cursor en GraphQL para `clientes`, `choferes` y `mantenimientos` (D109), y los arreglos de la sección 4 del informe.

Fuera de alcance: el alta de choferes y las tarifas (D107).

## 2. Backend y plataforma

| Qué | Efecto hoy | Arreglo |
|---|---|---|
| **Viajes corta en los 3 s del Gateway (D98).** A veces la lista llega con `DEPENDENCIA_NO_DISPONIBLE` | La pantalla conserva las últimas filas buenas | Medir con las trazas OTel (perfil `trazas`) Gateway → Viajes → PostgreSQL antes de proponer un arreglo |
| **`VITE_*` del portal en la nube** | No hay build de nube del portal; las cuatro `VITE_*` apuntarían a localhost | Definirlas en el workflow de Firebase cuando exista (T3b.4, T11.9) |

## 3. Centro de Control y portal

- **«Volver a la app» desde una alerta** lleva a la raíz de la app de origen, no a la página. Si se quiere la página: `?desde=<app>&ruta=<path relativo>`.
- **Sin probar en el navegador:** el login se sirve en `MacBook-Air-de-Brayan.local` (emisor fijo), así que las pruebas automáticas no pueden iniciar sesión en localhost. Quedan las sesiones por rol, la auditoría con axe, el banner sin parpadeo con un servicio caído y el foco tras «Reintentar».
- **Para revisar:** «Aprobar entrega» no pide confirmación, igual que las demás aprobaciones.

## 4. App del chofer

**Hecho en la vuelta 1:** fatiga sin GPS y SIN_ROSTRO solo en marcha (D60), reintento de un inicio, una entrega o un rechazo FALLIDA (D106), «Siguiente / Listo» en iOS, alarma en bucle y `react-native-worklets` 0.10.1. En la vuelta 2: velocidad desconocida, alertas sin posición al cerrar sesión, y el 409 en el inicio.

**A verificar en un iPhone o un Android real** (el simulador no tiene cámara frontal ni entrega foto):

- Detector de fatiga: rendimiento por cuadro, rostros chicos a unos 90 cm, el umbral `OJO_CERRADO = 0,5` de noche y con lentes, la gorra que tapa los ojos, y la alarma en bucle.
- La foto de evidencia y la firma (también la ruta de `captureRef` en Android).
- La barra «Siguiente / Listo» del teclado numérico en iOS.
- Un build nativo con `react-native-worklets` 0.10.1.

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

**Casos de uso nuevos de gestión** (vuelta 1): registrar, editar y dar de baja una unidad; editar e inhabilitar o habilitar un chofer; registrar y editar una ruta; editar un cliente; ajustar, suspender y reactivar una línea de crédito.

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
