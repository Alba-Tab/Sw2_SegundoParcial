# Gateway del Centro de Control

BFF GraphQL de las 4 apps Angular (spec 016): NestJS 11 con Apollo Server 5, esquema `contratos/graphql/centro-control.graphql` (*schema first*) y `graphql-ws` para la suscripción. **Solo compone**: no tiene base ni reglas de negocio. Contrato HTTP: [`contratos/openapi/gateway.yaml`](../../contratos/openapi/gateway.yaml).

## Qué hace

- **Token:** valida emisor, audiencia `gateway`, firma y vencimiento. Sin token → `401`; `cliente` o `chofer` → `403 SIN_PERMISO` (FK1).
- **Intercambio:** por cada servicio pide un token a nombre del mismo usuario con `libs/intercambio-token` (RFC 8693, caché por `sub` y audiencia). Nunca reenvía el token de la app. Propaga `traceparent` y `X-Correlation-Id`.
- **Permisos por campo:** directiva `@roles`. Si el rol no está, el campo sale en `null` con `SIN_PERMISO` en su `path` (por ejemplo, el despachador no ve `Viaje.monto` ni `cuentasPorCobrar`).
- **Respuesta parcial:** 3 s por llamada al componer (D98). Con 5xx, tiempo de espera o red caída, los campos de ese servicio salen en `null` con `DEPENDENCIA_NO_DISPONIBLE` y el resto sale igual (FR1, FR2, FC6). Los campos raíz de `Query` son anulables por eso. Las mutaciones simples esperan 10 s, `exportarReporte` 30 s y `preguntar` 60 s.
- **DataLoader** por petición: servicio, viaje, riesgo, unidad por placa, línea de crédito, y la bitácora y la entrega de cada viaje de una lista. Como los servicios no filtran por ids, pide en paralelo, como máximo 10 a la vez (D97).
- **Límites:** profundidad 8 (regla de validación; `__schema` y `__type` también cuentan, solo `__typename` no) y complejidad 1.000; una lista con `limite` multiplica por él, acotado a 1–100 (D101). Si se pasa → `CONSULTA_DEMASIADO_COMPLEJA` sin llamar a ningún servicio. Un `limite` fuera de 1–100 → `VALIDACION`.
- **Presupuesto de llamadas:** cada petición HTTP a `/graphql` puede hacer como máximo **200 llamadas** a los servicios (`src/presupuesto.ts`). La complejidad no lo cubre: los campos por fila de una lista sin `limite` (`riesgo`, `hitos`, `entrega`, `unidad` y `monto` de cada viaje) valen 1, pero cada uno es una llamada. Lo descuenta el cliente REST, por el que pasan todos los cargadores (lo que el DataLoader ya tiene no cuenta dos veces). Agotado, cada campo que pediría otra llamada sale en `null` con `CONSULTA_DEMASIADO_COMPLEJA` y el resto sale igual. El valor se midió con cada operación de las apps y 100 filas por lista: `Tablero` 105 (162 si los resúmenes recorren sus 20 páginas), `Acciones` 101, `Mapa` y `EntregasObservadas` 51, `Viaje` 6 y las demás 3 o menos. La suscripción y la descarga de Excel no lo usan.
- **Ids en las rutas REST:** cada valor que va en la ruta (`rutaRest`) solo puede tener letras, números, `-` y `_`; `../`, `?`, `/` o `%` → `VALIDACION` sin llamar al servicio.
- **Tablero:** los conteos y saldos salen de todas las páginas (cursor, como máximo 20 de 100 y 3 s en total); las facturas por vencer las filtra Finanzas con `venceDesde`/`venceHasta` (ventanas de la spec 015).
- **Mutaciones:** la `claveIdempotencia` viaja como `Idempotency-Key`; el servicio dueño es la autoridad. Los errores del servicio llegan en `errors[].extensions` con `codigo` y `status`. Si el servicio responde 202 sin cuerpo y la relectura falla, la escritura ya se aplicó: el campo sale en `null` y la respuesta trae `extensions.avisos`.
- **Errores:** consulta mal escrita, variables, operación inexistente o cuerpo vacío → `400 VALIDACION` en el formato de errores de GraphQL. Un cuerpo que no es JSON (`400`) o que pasa los 100 KB (`413`) no llega a GraphQL: sale en Problem Details con `VALIDACION`, igual que cualquier otro error HTTP fuera de GraphQL (una ruta que no existe → `404 NO_ENCONTRADO`). El `title` de los Problem Details es un texto para personas, no el código. Un 4xx de un servicio llega con su `codigo`, o con el del status si no trae (`404` → `NO_ENCONTRADO`): `viaje`, `factura` y `unidad` de un id que no existe salen en `null` con `NO_ENCONTRADO`. Un error interno sale como `ERROR_INTERNO` y antes se registra en el log JSON (000 §10) con `correlationId` y `traceId`. Los errores de validación no sugieren nombres del esquema.
- **Suscripción `alertas`:** el token va en `connection_init`. Un token inválido cierra con `4401`, un rol sin alertas con `4403`, y el vencimiento del token o los 3.600 s también cierran con `4401`. Consulta a Analítica cada 3 s con el último cursor; al cerrar se detiene enseguida.
- **Excel (D21):** `exportarReporte` devuelve `<GATEWAY_URL>/exportaciones/<payload>.<HMAC>`. `GET /exportaciones/{token}` no pide `Authorization`: exige exactamente `payload.firma` con la firma de 43 caracteres base64url y hasta 400 caracteres, compara el texto de la firma en tiempo constante, valida el vencimiento y baja el archivo de Analítica con el token de servicio y `X-Solicitante-Sub`. Los errores salen como `application/problem+json`.

## Variables

Todas con valores de ejemplo en [`.env.example`](.env.example): `OIDC_ISSUER`, `OIDC_CLIENTE_SECRETO` (cliente `gateway`), `VIAJES_URL`, `FLOTA_URL`, `FINANZAS_URL`, `ANALITICA_URL`, `GATEWAY_URL`, `EXPORTACION_HMAC_SECRETO` (igual en todas las instancias), `CORS_ORIGENES` y `GRAPHQL_INTROSPECCION` (`false` por defecto; `true` solo para explorar el esquema en local).

## Correr

```bash
npm ci
npm run verificar        # tipos, formato y pruebas (Keycloak y servicios falsos en un servidor local)
docker compose -f ../../plataforma/compose/compose.yaml --profile core --profile plataforma --profile ia up -d gateway
```
