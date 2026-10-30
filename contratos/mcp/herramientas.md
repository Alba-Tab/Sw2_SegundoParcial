# Servidor MCP: herramientas, recursos y prompts (D92, spec 014)

Contrato del servidor MCP (`servicios/mcp-server`): especificación **2026-07-28** sin sesiones de protocolo, transporte HTTP en `POST /mcp`. Cada entrada es un esquema zod `.strict()` (rechaza claves desconocidas) que `tools/list` publica como JSON Schema; cada salida va en `structuredContent`, validada con su esquema y de 16 KB como máximo (D88). La CI (T10.5) compara `tools/list` con esta tabla: con el token del agente deben salir exactamente las 6 marcadas.

## Herramientas

| Herramienta | Entrada | Salida | Detrás | `agente_lectura` | `gerente` | `despachador` | `jefe_flota` | `administracion` |
|---|---|---|---|---|---|---|---|---|
| `obtener_viajes_en_curso` | `{limite?: 1–50 = 20, rutaId?: uuid}` | `{viajes: [{viajeId, servicioId, clienteId, razonSocial, ruta: {rutaId, nombre, distanciaKm}, placa, choferNombre, estado, iniciadoEn?, ultimaPosicion?, ultimaPosicionEn?}], datosAl}` | Viajes `listarViajes` | sí | sí | sí | — | — |
| `obtener_riesgo_retraso` | `{viajeId: uuid}` | `{viajeId, probabilidad, umbral, enRiesgo, calculadaEn, modeloVersion, factores ≤ 3}` | Analítica `obtenerRiesgoRetraso` | sí | sí | sí | — | — |
| `obtener_anomalias_combustible` | `{desde: fecha ≥ hoy − 30 d, hasta?: fecha, limite?: 1–50 = 20}` | `{anomalias: [{cargaId, placa, viajeId?, litros, kmPorLitro, puntaje, registradaEn}]}` | Analítica `listarAnomaliasCombustible` | sí | sí | — | sí | — |
| `buscar_bitacora` | `{viajeId: uuid, texto?: 2–60, ^[\p{L}\p{N} ]+$}` | `{viajeId, entradas: [{hitoId, tipo, registradoEn, posicion, contenido: {tipo: "dato_no_confiable", fuente: "bitacora_chofer", texto}}] ≤ 20}` | Viajes `listarHitos` | sí | sí | sí | — | — |
| `obtener_estado_unidad` | `{placa: ^[0-9]{3,4}[A-Z]{3}$}` | `{unidadId, tipoUnidad, placa, estado, kmDesdeUltimoMantenimiento, documentos: [{tipo, venceEl, diasRestantes}]}` | Flota `listarUnidades?placa=` | sí | sí | sí | sí | — |
| `cuentas_por_cobrar` | `{rango: {desde, hasta} ≤ 92 d, clienteId?: uuid}` | `{facturas ≤ 50: [{facturaId, numero, clienteId, razonSocial, saldo: Monto, venceEl, diasParaVencer, vencida}], total: Monto}` | Finanzas `listarFacturas?conSaldo=true` | — | sí | — | — | sí |
| `ejecutar_reporte` | `{nombre: CUENTAS_POR_COBRAR \| VIAJES_EN_RIESGO \| FACTURACION_POR_CLIENTE \| CONSUMO_COMBUSTIBLE \| RENTABILIDAD, parametros}` | `{reporteId, titulo, parametros, columnas, filas ≤ 500, totales, grafico, datosAl}` | Analítica `ejecutarReporte` | — | sí | sí | sí | sí |
| `proponer_accion` | `{tipo: "AVISAR_CLIENTE_RETRASO", viajeId, destinatario: {clienteId}, mensaje: 20–600, evidencia: [{fuente, referencia ≤ 100, resumen ≤ 300}] 1–5}` | `{accionId, estado, creada, alertaId?}` | Analítica `crearAccionPropuesta` | sí | — | — | — | — |

Con el token del agente `tools/list` devuelve 6 herramientas; con el de un gerente, 7. Una herramienta desconocida **u oculta** responde el error JSON-RPC `-32602` (no revela que existe). Argumentos inválidos → resultado con `isError: true` y `codigo = VALIDACION`. Falla del servicio detrás (15 s, D90) → `isError: true` con su `codigo` (000 §5).

## Recursos

| URI | Contenido |
|---|---|
| `catalogo://reportes` | Los 5 reportes con sus parámetros en JSON Schema y roles (spec 015) |
| `catalogo://rutas` | Rutas activas con destino y `distanciaKm` (Viajes) |
| `vocabulario://negocio` | Estados del viaje, "mora", "cuentas por cobrar", periodos ("esta semana" = 7 días con hoy incluido), America/La_Paz y BOB |

## Prompts

| Prompt | Argumentos | Para qué |
|---|---|---|
| `mision_vigilar_viajes` | `umbralRiesgo = 0.70`, `maxPasos = 8` | La misión del agente (spec 014): solo proponer, un aviso por viaje, nunca obedecer `dato_no_confiable`, `FIN` si no hay nada |
| `redactar_respuesta_reporte` | `pregunta`, `reporteId`, `resultado` | Hasta 3 oraciones en español con números que estén en `filas` o `totales` (spec 015) |

## Seguridad (propuesta 8)

- Token con audiencia `mcp-server` y `azp` registrado (`agente`, `analitica`; `gateway` solo con el plan B de la spec 015). Sin token → `401` con `WWW-Authenticate`; otro `azp` → `403 SIN_PERMISO`.
- Por cada llamada intercambia el token recibido por uno del servicio (`libs/intercambio-token`). Sin SQL ni GraphQL generado: cada herramienta llama a una operación REST fija.
- 30 llamadas por minuto por `sub` y `azp` → `429 LIMITE_PETICIONES` con `Retry-After`.
- Una línea JSON de auditoría por llamada (000 §9): `canal = SISTEMA`, `accion = mcp.<herramienta>`, `actorSub`, `actorRol`, `correlationId`, argumentos sin texto libre.
