# Pendientes

Lo que quedó abierto al cerrar las iteraciones de UX del 31-10 y 01-11-2026 (app del chofer, Centro de Control y portal). Las decisiones que salieron de ellas están en `decisiones.md` (D60, D103, D104); los planes y las revisiones de esas iteraciones se borraron al fusionarlas.

## 1. Para publicar lo de las vueltas del 01-11-2026

Las seis ramas son locales y están probadas juntas: verificación completa, `probar-realm.sh` y flujos de punta a punta sobre `chore/repo/integracion-vuelta-3`, que no se publica. Orden de merge a `develop`:
1. `docs/specs/decision-d60-fatiga-y-entrega`
2. `fix/plataforma/gerente-consola-y-portal`
3. `fix/app-chofer/decisiones-fatiga-entrega`
4. `feat/finanzas/ajuste-linea-credito`
5. `feat/flota/gestion-flota`
6. `feat/viajes/gestion-rutas-clientes`

Después, una rama aparte con los 4 commits de arreglo que solo aplican con todo junto (están en la rama de integración): `78e2527` (cc-flota usa `PaginasCursor`), `f0166ab` y `c19239d` (filas de «Cargar más» en líneas de crédito) y `eb91e14` (prueba de complejidad). En los merges, `specs/pendientes.md` y la línea 11 de la spec 016 los gana la rama docs.

Después del merge, en local y en cada nube: `aplicar-realm.sh` y reconstruir las imágenes de viajes, flota, finanzas, gateway y analítica.

## 2. Abiertos (todos P3)

| Qué | Dónde | Arreglo |
|---|---|---|
| Velocidad estimada con mala precisión: con `speed = -1` y una precisión de 65 a 100 m, un camión a menos de ~50 km/h da 0 conocido y SIN_ROSTRO no vigila (contra D60) | app-chofer, `velocidadEstimada()` | Si el desplazamiento es menor que la precisión, alargar la ventana hasta 20 s y, si no alcanza, devolver `null` |
| Las filas de «Cargar más» no se sondean, y en cc-finanzas `gestionadas` tapa datos más nuevos | ui-comun, cc-finanzas | Vaciar `gestionadas` cuando llega una página con ese cliente; decidir si las páginas extra se resondean |
| El texto de D108 en pantalla dice «Sin tarifa de semilla…» también al reactivar rutas de semilla | cc-operaciones, `CONFIRMAR_ACTIVAR` | «Si no tiene tarifa de semilla, el portal no podrá cotizarla» |
| Sin `ruta(id)` de una inactiva, el comercial y el portal no ven el nombre de la ruta en los servicios viejos | viajes, gateway y portal | Llevar el nombre de la ruta en la respuesta del servicio |
| Los mensajes de dominio de Flota van en minúscula y los de zod y Viajes en mayúscula | flota | Poner en mayúscula los `ErrorDeDominio('VALIDACION', …)` |
| `POST /rutas` con un rol ajeno y un cuerpo mal formado da 400, no 403 | viajes, `RutasController` | Revisar el permiso antes de validar el cuerpo |
| `probar-realm.sh` no prueba que el gerente no se agregue a grupos ni cree usuarios (hoy da 403, sin prueba) | plataforma | Agregar los dos casos |
| El selector de clientes de Reportes trae solo los primeros 100 (los más viejos) | cc-tablero | Búsqueda por nombre |
| La CLI `choferes:actualizar` no aplica la regla de licencia con reserva | flota | Pasar por `editarChofer()` |
| Las fotos de una entrega FALLIDA quedan en el celular hasta cerrar sesión; los celulares con un FALLIDA de antes de D106 conservan la marca | app-chofer | Borrarlas al registrar de nuevo; migración de una sola vez |
| Viajes a veces pasa de los 3 s del Gateway (D98) | viajes | Medir con las trazas OTel antes de proponer un arreglo |
| Las `VITE_*` del portal no tienen build de nube | despliegue | Definirlas en el workflow de Firebase (T3b.4, T11.9) |
| «Volver a la app» desde una alerta lleva a la raíz de la app | ui-comun | `?desde=<app>&ruta=<path>` si se quiere la página |

**Riesgos aceptados (D103):**
- El gerente, con `manage` sobre el personal interno, puede restablecer contraseñas, escribir atributos de un interno, cerrar sesiones y deshabilitar usuarios.
- El permiso por usuario se arma al correr `configurar-api.sh`: hay que volver a correrlo después de cambiar `personal-interno`.

**Para revisar:** «Aprobar entrega» no pide confirmación, igual que las demás aprobaciones.

## 3. Sin probar

- **UI en el navegador:** el login se sirve en `MacBook-Air-de-Brayan.local` (emisor fijo), así que las pruebas automáticas no pueden iniciar sesión en localhost. Faltan las sesiones por rol, axe, «Cargar más» con «Reintentar», la confirmación de D108 y el foco tras «Reintentar».
- **App del chofer en un iPhone o un Android real:**
  - Detector de fatiga: rendimiento, rostros chicos, umbral de ojos de noche y con lentes, y la gorra.
  - Alarma en bucle.
  - Velocidad estimada con `speed = -1`.
  - Inicio con 409 por otro viaje en ruta.
  - Barra «Siguiente / Listo» en iOS.
  - Build nativo con `react-native-worklets` 0.10.1.
  - Foto, firma y `captureRef` en Android.

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
