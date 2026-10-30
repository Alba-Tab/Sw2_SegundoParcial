# Gateway del Centro de Control

BFF GraphQL de las 4 apps Angular (spec 016): NestJS 11 con Apollo Server 5, esquema `contratos/graphql/centro-control.graphql` (*schema first*) y `graphql-ws` para la suscripción. **Solo compone**: no tiene base ni reglas de negocio. Contrato HTTP: [`contratos/openapi/gateway.yaml`](../../contratos/openapi/gateway.yaml).

## Qué hace

- **Token:** valida emisor, audiencia `gateway`, firma y vencimiento. Sin token → `401`; `cliente` o `chofer` → `403 SIN_PERMISO` (FK1).
- **Intercambio:** por cada servicio pide un token a nombre del mismo usuario con `libs/intercambio-token` (RFC 8693, caché por `sub` y audiencia). Nunca reenvía el token de la app. Propaga `traceparent` y `X-Correlation-Id`.
- **Permisos por campo:** directiva `@roles`. Si el rol no está, el campo sale en `null` con `SIN_PERMISO` en su `path` (por ejemplo, el despachador no ve `Viaje.monto` ni `cuentasPorCobrar`).
- **Respuesta parcial:** 3 s por llamada al componer (D98). Con 5xx, tiempo de espera o red caída, los campos de ese servicio salen en `null` con `DEPENDENCIA_NO_DISPONIBLE` y el resto sale igual (FR1, FR2, FC6). Los campos raíz de `Query` son anulables por eso. Las mutaciones simples esperan 10 s, `exportarReporte` 30 s y `preguntar` 60 s.
- **DataLoader** por petición: servicio, viaje, riesgo, unidad por placa y línea de crédito. Como los servicios no filtran por ids, pide en paralelo, como máximo 10 a la vez (D97).
- **Límites:** profundidad 8 (regla de validación) y complejidad 1.000; una lista con `limite` multiplica por él (D101). Si se pasa → `CONSULTA_DEMASIADO_COMPLEJA` sin llamar a ningún servicio.
- **Mutaciones:** la `claveIdempotencia` viaja como `Idempotency-Key`; el servicio dueño es la autoridad. Los errores del servicio llegan en `errors[].extensions` con `codigo` y `status`.
- **Suscripción `alertas`:** el token va en `connection_init`. Un token inválido cierra con `4401`, un rol sin alertas con `4403`, y el vencimiento del token o los 3.600 s también cierran con `4401`. Consulta a Analítica cada 3 s con el último cursor; al cerrar se detiene enseguida.
- **Excel (D21):** `exportarReporte` devuelve `<GATEWAY_URL>/exportaciones/<payload>.<HMAC>`. `GET /exportaciones/{token}` no pide `Authorization`: valida el HMAC en tiempo constante y el vencimiento, y baja el archivo de Analítica con el token de servicio y `X-Solicitante-Sub`.

## Variables

`OIDC_ISSUER`, `OIDC_CLIENTE_SECRETO` (cliente `gateway`), `VIAJES_URL`, `FLOTA_URL`, `FINANZAS_URL`, `ANALITICA_URL`, `GATEWAY_URL`, `EXPORTACION_HMAC_SECRETO` (igual en todas las instancias), `CORS_ORIGENES` y `GRAPHQL_INTROSPECCION` (`false` en la nube).

## Correr

```bash
npm ci
npm run verificar        # tipos, formato y pruebas (Keycloak y servicios falsos en un servidor local)
docker compose -f ../../plataforma/compose/compose.yaml --profile core --profile plataforma --profile ia up -d gateway
```
