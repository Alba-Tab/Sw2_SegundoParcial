# 015 · Reportes, consulta por voz y Excel

Estado: **revisado** · Casos de uso: CU-16 Consultar reporte generativo, CU-17 Exportar a Excel · Responsable: Brayan Albaro Garcia Taboada

El gerente (u otro rol interno) pregunta por voz en cc-tablero; Whisper transcribe en el navegador; Analítica pide al LLM una **intención** en JSON, la valida en código contra el catálogo de 5 reportes, los permisos y las fechas, ejecuta el reporte **por el servidor MCP** y el LLM redacta la respuesta con números calculados en código. Se devuelven el texto, la tabla de respaldo, el gráfico y la opción de Excel, que se descarga por el Gateway con un enlace HMAC sin estado (D21). Requisitos 8, 10 y 18. Decisiones: D21, D36, D38, D46. Propuesta 4.6, 5.16, 6.3, 7.4 y 9; K1.

## Actores y roles

| Actor | Rol | Qué hace |
|---|---|---|
| Gerente | `gerente` | Pregunta por voz, ve los 5 reportes y exporta |
| Administración, despachador, jefe de flota | `administracion`, `despachador`, `jefe_flota` | Ven y exportan los reportes de su rol (tabla del catálogo) |
| cc-tablero | — | Whisper `tiny` en un Web Worker (D38); tabla con Angular Material (D46) |
| Gateway | cliente `gateway` | Mutaciones `preguntar` y `exportarReporte`; `GET /exportaciones/{token}` |
| Analítica | cliente `analitica` | Intención, validación, cliente MCP, redacción, reportes y archivos |
| Servidor MCP | `mcp-server` | `ejecutar_reporte`: permisos y auditoría uniformes (spec 014) |

## Precondiciones

- Modelo de lectura al día (spec 013). Ollama con `qwen3:4b` (D36).
- Los modelos de Whisper se sirven desde el hosting propio, no desde un CDN (micro-PoC: la pestaña Red queda vacía al transcribir).

## Catálogo de reportes (propuesta 4.6)

| `reporteId` | Pregunta típica | Parámetros | Roles | Fuente (modelo de lectura) | Tabla y gráfico |
|---|---|---|---|---|---|
| `CUENTAS_POR_COBRAR` | "¿Qué clientes me deben pagar esta semana?" | Vencimiento `desde`/`hasta` (≤ 92 días), `clienteId?`, `incluirVencidas = true` | `administracion`, `gerente` | `hecho_factura` (`FacturaEmitida`, `PagoRegistrado`) | Cliente, factura, monto, saldo, vencimiento, días, vencida; total del saldo. Barras de saldo por cliente |
| `VIAJES_EN_RIESGO` | "¿Qué viajes van atrasados?" | `rutaId?`, `umbral` 0,50–0,95 (por defecto 0,70) | `despachador`, `gerente` | `hecho_viaje` + `prediccion_retraso` | Viaje, cliente, ruta, placa, chofer, probabilidad, bloqueos, última posición. Barras de probabilidad |
| `FACTURACION_POR_CLIENTE` | "¿Cuánto facturamos a Agroexport en octubre?" | Emisión `desde`/`hasta` (≤ 366 días), `clienteId?` | `administracion`, `gerente` | `hecho_factura`, `hecho_pago` | Cliente, mes, facturas, facturado, cobrado, saldo. Barras apiladas por mes |
| `CONSUMO_COMBUSTIBLE` | "¿Qué camiones gastan más diésel por kilómetro?" | `desde`/`hasta` (≤ 92 días), `placa?` | `jefe_flota`, `gerente` | `hecho_combustible` | Placa, km, litros, km/L, BOB, BOB/km, anomalías, caídas. Barras de km/L |
| `RENTABILIDAD` | "¿Cuánto nos dejó la ruta a Arica este mes?" | Entrega `desde`/`hasta` (≤ 366 días), `agrupar: VIAJE\|RUTA`, `rutaId?` | `gerente`, `administracion` | `hecho_viaje` + `hecho_factura` + `hecho_combustible` (datos de Viajes, Finanzas y Flota) | Ingreso facturado, combustible, margen, margen %, BOB/km. Barras de margen |

Todos responden con `datosAl` ("datos al hh:mm") y se pueden exportar. Máximo 500 filas en pantalla y 10.000 en Excel (D93); más → `400 VALIDACION` en el campo del rango.

**Periodos que entiende la intención.** Las fechas **relativas** las calcula el código con la fecha de `America/La_Paz`; el LLM solo devuelve el nombre del periodo: `HOY`, `ESTA_SEMANA` (7 días con hoy incluido: hacia adelante en cuentas por cobrar, que mira vencimientos; hacia atrás en los demás), `ESTE_MES`, `MES_ANTERIOR`, `MES` (con `mes` 1–12 y `anio` opcional; sin año, el del año en curso, o el anterior si ese mes todavía no llegó: "octubre" dicho en noviembre de 2026 es octubre de 2026), `ULTIMOS_30_DIAS`, `ULTIMOS_3_MESES` y `RANGO`. En `RANGO` el LLM solo copia las fechas que el usuario **dijo explícitamente** (`desde`, `hasta` en `YYYY-MM-DD`) y el código valida formato, orden y límites. El vocabulario del MCP (`vocabulario://negocio`, spec 014) dice lo mismo.

## Pasos (camino feliz)

**A. Consulta por voz (CU-16)**

1. El gerente mantiene pulsado el micrófono (máximo 15 s, D94). Whisper `tiny` transcribe en español en un Web Worker; el texto se ve y se puede corregir antes de enviar (D95).
2. cc-tablero envía la mutación `preguntar(texto)` (3 a 300 caracteres). El Gateway intercambia el token (audiencia `analitica`) y llama a `POST /api/v1/voz/preguntas` con `{texto}`.
3. Analítica pide al LLM la intención con salida JSON restringida por esquema (temperatura 0, 20 s): `{reporteId | null, periodo, mes?, anio?, desde?, hasta?, filtros: {clienteNombre?, placa?, rutaNombre?, agrupar?}, aclaracion?}`. El prompt lleva el catálogo y el vocabulario (los mismos recursos que publica el MCP, spec 014) y la fecha de hoy.
4. **Validación en código** (pydantic), en este orden:
   1. `reporteId` nulo o fuera del catálogo → `422 PREGUNTA_FUERA_DE_ALCANCE`;
   2. el rol del token no está en los roles del reporte → `403 SIN_PERMISO`;
   3. nombres a ids, con texto normalizado (minúsculas, sin tildes ni signos): `clienteNombre` contra las razones sociales de la copia `cliente` y `rutaNombre` contra `ruta`; primero coincidencia exacta y, si no hay, **por prefijo de palabra** (cada palabra dicha es el comienzo de una palabra del nombre: "agro" coincide con "Agro Moroso" y con "Agroexport SRL"); `placa` con su patrón. Ninguna coincidencia → `ACLARACION` ("No encontré ese cliente"); más de una → `ACLARACION` con hasta 3 opciones;
   4. periodo a fechas y límites del reporte; si falta o se pasa → `ACLARACION`.
5. Analítica llama a `ejecutar_reporte` en el MCP con el token **intercambiado otra vez** (audiencia `mcp-server`); el MCP verifica el rol, audita e intercambia hacia `analitica` para llamar `GET /api/v1/reportes/{reporteId}`. Es la cadena de 3 intercambios: cc-tablero → gateway → analitica → mcp-server → analitica.
6. Redacción: `prompts/get redactar_respuesta_reporte` y el LLM escribe hasta 3 oraciones en español. **Regla de números:** cada número del texto debe estar en `filas` o `totales` (con formato `2.800,00`); si no, o si el LLM no responde en 20 s, se usa una plantilla fija ("Hay 3 facturas por 8.400,00 BOB que vencen entre el 03/11 y el 09/11").
7. Responde `200` con `RespuestaVoz {tipo: RESPUESTA, texto, reporteId, parametros, tabla: {columnas, filas}, grafico, totales, datosAl, exportable: true}`. cc-tablero muestra el texto, la tabla, el gráfico y "Exportar a Excel".

**B. Exportar a Excel (CU-17, D21)**

8. "Exportar" → mutación `exportarReporte(id, params, claveIdempotencia)` con una clave nueva por clic (spec 016). El Gateway intercambia el token (audiencia `analitica`) y llama a `POST /api/v1/exportaciones` con `{reporteId, parametros}` e `Idempotency-Key`.
9. Analítica verifica el rol, corre el reporte (el mismo código que `ejecutarReporte`) y genera el `.xlsx` con openpyxl: hoja "Datos" (encabezados, filas, totales, dinero con `#,##0.00`, fechas como fechas) y hoja "Parámetros" (reporte, parámetros, generado en, por quién, datos al). Lo guarda en `exportacion` (`exportacionId`, `sub`, archivo, `nombreArchivo`, `expiraEn = ahora + 10 min`) y responde `201` con `{exportacionId, nombreArchivo, expiraEn}`.
10. El Gateway arma `token = base64url(exportacionId.sub.exp) + "." + base64url(HMAC-SHA256(EXPORTACION_HMAC_SECRETO, payload))` y devuelve `UrlDescarga {url: <GATEWAY_URL>/exportaciones/{token}, expiraEn}`.
11. El navegador abre la URL (sin `Authorization`). **Cualquier instancia** del Gateway valida el HMAC (comparación en tiempo constante) y el vencimiento, pide a Analítica `GET /api/v1/exportaciones/{exportacionId}/archivo` con **su token de servicio** y el encabezado `X-Solicitante-Sub`, y devuelve el archivo con `Content-Disposition: attachment; filename="cuentas-por-cobrar-2026-11-03.xlsx"` y `Cache-Control: no-store`. Funciona aunque Cloud Run haya cambiado de instancia o bajado a cero.
12. Un job de Analítica borra cada 5 min las exportaciones vencidas.

## Reglas de negocio

| Regla | Valor |
|---|---|
| Quién pregunta | `gerente`, `administracion`, `despachador`, `jefe_flota`; `comercial`, `cliente` y `chofer` → `403 SIN_PERMISO` |
| `preguntar` sin `Idempotency-Key` | No cambia estado (solo auditoría): reenviar repite la consulta, así que no lleva clave |
| Intención | El LLM solo elige reporte, periodo y filtros por nombre (y copia fechas explícitas en `RANGO`); ids, fechas relativas, validación de fechas y permisos los decide el código |
| Aclaración | `200` con `tipo = ACLARACION`, `texto` y hasta 3 `opciones` completas (`{reporteId, parametros}`) que la pantalla muestra como botones y ejecuta con la consulta `reporte(id, params)` sin pasar por el LLM |
| LLM caído | `503 LLM_NO_DISPONIBLE` en la intención; la pantalla dice "El asistente no está disponible" y ofrece el catálogo con botones (FR4). Si cae solo en la redacción, se usa la plantilla |
| Botones y tablero | `reporte(id, params)` va Gateway → Analítica `ejecutarReporte` directo, sin LLM ni MCP |
| Exportación | Mismos roles que el reporte; Analítica guarda el archivo **10 min**; el enlace vence a los 10 min; máximo 5 MB (D96) |
| HMAC | Secreto `EXPORTACION_HMAC_SECRETO` igual en todas las instancias del Gateway (gestor de secretos). Firma inválida → `403 SIN_PERMISO`; vencido → `404 EXPORTACION_VENCIDA`. Analítica además exige que `X-Solicitante-Sub` sea el `sub` guardado, y solo acepta el encabezado con el token de servicio del `gateway` |
| Tiempos de espera en el Gateway (D98, spec 016) | `preguntar` 60 s; `exportarReporte` 30 s; en el plan B, 25 s por cada llamada (`/voz/interpretaciones`, `ejecutar_reporte`, `/voz/redacciones`). Los 3 s de la composición no aplican aquí |
| Auditoría | Analítica registra pregunta, intención validada, reporte y exportación; el MCP registra `ejecutar_reporte` (spec 014) |

**Plan B de K1 (2 saltos).** Si en PoC-1 el tercer intercambio falla (RHBK-3599), el Gateway orquesta con `VOZ_CADENA=DOS_SALTOS`: (a) `POST /api/v1/voz/interpretaciones` en Analítica (intención validada; 1 intercambio); (b) el Gateway llama al MCP `ejecutar_reporte` (gateway → mcp-server → analitica: 2 intercambios; `gateway` se registra como cliente del MCP); (c) `POST /api/v1/voz/redacciones` con el resultado (1 intercambio). La cadena más larga es de 2 saltos y el usuario ve lo mismo.

## Estados que cambia

| Entidad | Cambio |
|---|---|
| `Exportacion` (Analítica) | — → disponible → borrada al vencer (10 min) |
| Ninguna otra | Los reportes solo leen el modelo de lectura |

## Contratos que toca

- REST `contratos/openapi/analitica.yaml` (nuevas): `ejecutarReporte` (`GET /api/v1/reportes/{reporteId}`, parámetros por consulta), `listarReportes` (`GET /api/v1/reportes`: el catálogo), `preguntar` (`POST /api/v1/voz/preguntas`), `interpretarPregunta` y `redactarRespuesta` (`POST /api/v1/voz/interpretaciones`, `/voz/redacciones`; solo plan B), `crearExportacion` (`POST /api/v1/exportaciones`, `Idempotency-Key`, `201`), `obtenerArchivoExportacion` (`GET /api/v1/exportaciones/{exportacionId}/archivo`, solo el token de servicio del `gateway`). Respuestas `200`, `201`, `400`, `401`, `403`, `404`, `422`, `503`.
- REST `contratos/openapi/gateway.yaml` (archivo nuevo, D21): `descargarExportacion` (`GET /exportaciones/{token}`, sin `Authorization`; `200`, `403 SIN_PERMISO`, `404 EXPORTACION_VENCIDA`, `503 DEPENDENCIA_NO_DISPONIBLE` con `Retry-After`).
- MCP: herramienta `ejecutar_reporte`, recurso `catalogo://reportes`, prompt `redactar_respuesta_reporte` (spec 014).
- GraphQL (F9/F10, propuesta 6.3): `reporte(id: ReporteId!, params: ReporteParams): ReporteResultado!`, `preguntar(texto: String!): RespuestaVoz!`, `exportarReporte(id: ReporteId!, params: ReporteParams, claveIdempotencia: ID!): UrlDescarga!` (spec 016).

## Errores y caminos alternativos

| Caso | Respuesta | En cc-tablero |
|---|---|---|
| Pregunta fuera del catálogo | `422 PREGUNTA_FUERA_DE_ALCANCE` | "Puedo responder sobre estos 5 reportes" + botones |
| Reporte de otro rol | `403 SIN_PERMISO` | "No tienes permiso para ese reporte" |
| Cliente ambiguo | `200` con `tipo = ACLARACION` | "¿Te refieres a Agro Moroso o a Agroexport?" con 2 botones |
| LLM caído | `503 LLM_NO_DISPONIBLE` | Catálogo con botones |
| Rango demasiado largo | `200` con `tipo = ACLARACION` (por voz) o `400 VALIDACION` (por botón) | "El máximo es 92 días" |
| Enlace de Excel vencido | `404 EXPORTACION_VENCIDA` | "El enlace venció; vuelve a exportar" |
| Finanzas caída | El reporte responde desde el modelo de lectura con su `datosAl` | "Datos al hh:mm" |
| Analítica caída | `503 DEPENDENCIA_NO_DISPONIBLE` | El panel de reportes muestra el error; el resto del tablero sigue |

## Criterios de aceptación

- **FM4 (normal). Dado** las facturas de Agroexport que vencen en los próximos 7 días (semilla T4.8), **cuando** el gerente pregunta "¿Qué clientes me deben pagar esta semana?", **entonces** recibe `RESPUESTA` con `CUENTAS_POR_COBRAR` desde hoy hasta hoy + 6 días, la tabla con esas facturas, un texto cuyos números están todos en la tabla y `exportable = true`.
- **FM4 (ambigua). Dado** "¿Cuánto facturamos a Agro en octubre?", **entonces** el periodo se resuelve en código a `MES` 10 de 2026 y la respuesta es `ACLARACION` con las opciones "Agro Moroso" y "Agroexport" (las dos coinciden por prefijo de palabra); **y al** tocar una, la tabla sale sin pasar por el LLM.
- **FM4 (fuera de alcance). Dado** "¿Quién gana el clásico el domingo?", **entonces** `422 PREGUNTA_FUERA_DE_ALCANCE` y el catálogo con botones.
- **FM4 (sin permiso). Dado** un `jefe_flota`, **cuando** pregunta por las cuentas por cobrar, **entonces** `403 SIN_PERMISO`.
- **FR4. Dado** Ollama detenido, **cuando** el gerente pregunta, **entonces** `503 LLM_NO_DISPONIBLE` y el catálogo con botones sigue funcionando.
- **Dado** la pregunta normal, **entonces** la auditoría del MCP tiene un `mcp.ejecutar_reporte` con el `sub` del gerente (la cadena de 3 intercambios conserva el usuario).
- **Plan B. Dado** `VOZ_CADENA=DOS_SALTOS`, **cuando** se repite la pregunta normal, **entonces** la respuesta es la misma y ningún token pasó por más de 2 intercambios.
- **Excel. Dado** el resultado, **cuando** exporta, **entonces** descarga un `.xlsx` con las hojas "Datos" y "Parámetros" y los mismos totales que la pantalla; **y dado** el mismo enlace 11 min después, **entonces** `404 EXPORTACION_VENCIDA`; **y dado** el enlace con un carácter cambiado, **entonces** `403 SIN_PERMISO`.
- **Dado** dos instancias del Gateway, **cuando** la exportación se crea en una y se descarga por la otra, **entonces** funciona (HMAC sin estado).
- **Dado** `RENTABILIDAD` de la ruta Aula, **entonces** el margen de cada viaje es el monto facturado menos sus cargas de combustible (datos de Viajes, Finanzas y Flota).
- **Dado** `caer-finanzas-api.sh`, **cuando** se pide `CUENTAS_POR_COBRAR`, **entonces** responde desde el modelo de lectura con "datos al hh:mm" (complementa FR2).
- **Dado** la transcripción en cc-tablero, **entonces** la pestaña Red no muestra pedidos a un CDN ni el audio saliendo.

## Cómo se demuestra en la defensa

Paso 9 del escenario: el gerente pregunta por voz en cc-tablero con la pestaña Red abierta (Whisper local), ve la tabla de cuentas por cobrar de Agroexport y la exporta a Excel; se abre el archivo. Luego FM4 con las otras tres preguntas y FR4 deteniendo Ollama. El reporte de rentabilidad muestra la unión de los 3 servicios (requisitos 7 y 8).
