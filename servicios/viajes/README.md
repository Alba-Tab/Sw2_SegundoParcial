# Viajes

Clientes, cotizaciones confirmadas, servicios, viajes en ruta y la saga `ProgramarViaje` (Temporal). Spring Boot 4.1.2 sobre Java 25, arquitectura hexagonal (ver [AGENTS.md](AGENTS.md)). Puerto **8101**.

| Pieza del esqueleto (T3a.2) | Dónde |
|---|---|
| Salud `GET /health` y `GET /health/ready` (PostgreSQL y RabbitMQ), sin Keycloak (P10) | `adaptadores/entrada/web/SaludController` |
| JWT de Keycloak: emisor `OIDC_ISSUER`, audiencia `viajes`, roles de `realm_access.roles`; sin `OIDC_ISSUER`, `/api/**` responde 503 `DEPENDENCIA_NO_DISPONIBLE` | `configuracion/SeguridadConfig` |
| Problem Details (RFC 9457) con `codigo` y `correlationId` | `adaptadores/entrada/web/Problemas`, `ManejadorDeProblemas` |
| `X-Correlation-Id`: se genera si no viene, va al MDC, a los logs y al sobre de los eventos | `adaptadores/entrada/web/CorrelacionFiltro` |
| Tablas comunes (`operacion_idempotente`, `outbox_eventos`, `inbox_eventos`, `auditoria`) | `db/migration/V1__tablas_comunes.sql` |
| Outbox y relay con confirmación del broker y `FOR UPDATE SKIP LOCKED` | `adaptadores/salida/persistencia/RegistroDeEventosOutbox`, `adaptadores/salida/mensajeria/RelayOutbox` |
| Logs JSON (000 §10) y trazas OTLP solo si `OTEL_EXPORTER_OTLP_ENDPOINT` existe | `configuracion/FormatoLog`, `configuracion/TrazasSiHayEndpoint` |
| CORS desde `CORS_ORIGENES` | `configuracion/SeguridadConfig` |
| Hilos virtuales de Java 25 | `spring.threads.virtual.enabled` |
| Interfaces REST y DTO generados desde `contratos/openapi/viajes.yaml` con openapi-generator 7.26 (`useSpringBoot4`, `useJackson3`); `SaludController` implementa `SaludApi` | `pom.xml`, `target/generated-sources/openapi` |

```bash
./mvnw verify                                            # 43 pruebas (Testcontainers + Temporal en memoria)
docker compose -f ../../plataforma/compose/compose.yaml --profile core --profile plataforma up -d --build viajes   # contexto: raíz del repo
curl localhost:8101/health/ready
```

## Alta de cliente (T4.1, spec 001)

- `POST /api/v1/clientes`: idempotente según 000 §4.1, con la respuesta guardada en `operacion_idempotente` en la misma transacción que el cliente, el Outbox y la auditoría. Después del commit vincula en Keycloak.
- `POST /api/v1/clientes/mio/vinculacion`, `GET /api/v1/clientes`, `/mio` y `/{clienteId}`, y `GET /api/v1/rutas` con sus permisos.
- **Vínculo en Keycloak** (`adaptadores/salida/identidad/VinculadorKeycloak`):
  - Escribe `clienteId` usando el `sub` como id del usuario (PoC-1).
  - Keycloak **asigna roles por id**, no por nombre (con solo el nombre responde 404 "Role not found"), y la cuenta `viajes` no puede leer el catálogo de roles. El id sale de `users/{sub}/role-mappings/realm/available`, donde FGAP solo deja ver `cliente`.
- **Validación de eventos:** cada evento se valida contra `contratos/eventos` antes de entrar al Outbox (networknt 3.0, con Jackson 3). Si no hay petición ni traza en curso, se generan `correlationId` y `traceparent`, que son obligatorios en el sobre.


## Programar viaje (T4.3, spec 003)

- `POST /api/v1/servicios` responde `202`. Pasos:
  1. Registra la clave en `EN_PROCESO`, con la respuesta ya guardada, y crea el `Servicio` con sus ids.
  2. Después del commit inicia `ProgramarViaje` con `REJECT_DUPLICATE` y conflicto `FAIL`.
  3. Marca la clave `COMPLETADA`.
- Un reenvío con la clave en `EN_PROCESO` repite el inicio; `WorkflowExecutionAlreadyStarted` cuenta como éxito (D43, FS7). Si Temporal no responde, la API devuelve `503` y la clave sigue en `EN_PROCESO`.
- `GET /api/v1/servicios/{id}` trae la `etapa` mientras el viaje está en `PROGRAMANDO`. Sale de la consulta `estado`, con 2 s de límite; si Temporal no responde, la etapa es `DESCONOCIDA`.
- `GET /api/v1/servicios` filtra por cliente y estado, ordena del más nuevo al más viejo y pagina con cursor.
- **Workflow** (`adaptadores/temporal/ProgramarViajeImpl`):
  - Corre los pasos 1, 2, 2b, 3, el pivote, 5 y 6, con los timeouts de D15.
  - Compensa en orden inverso. Un paso que falló por algo técnico también se compensa, porque el otro servicio pudo haber reservado antes de que venciera el tiempo.
  - Si una compensación se agota, el viaje pasa a `REQUIERE_INTERVENCION` y el workflow espera la señal `resolverIntervencion`.
  - Maneja las señales `aprobacionCredito` y `resolverIntervencion`.
- **Actividades `Viajes.*`** (`aplicacion/viaje/ProgramacionDeViaje`): todas son idempotentes. `cancelarViaje` crea el viaje ya cancelado si el paso 1 no llegó a crearlo, para que el servicio no quede en `PROGRAMANDO`.
- **Conversor** `ConversorTemporal`: Jackson 3, `NON_NULL` y `FAIL_ON_UNKNOWN_PROPERTIES` (PoC-2).
- **Variables:**
  - `TEMPORAL_ADDRESS`;
  - `TEMPORAL_WORKER=false` deja solo la API;
  - `SAGA_ESPERA_APROBACION`, `SAGA_COMPENSACION_SCHEDULE_TO_CLOSE` y `SAGA_COMPENSACION_MAXIMO_INTENTOS`, con los valores de demo en `.env.demo`.
- **Pruebas:**
  - `ContratoSagaTest`: los ejemplos del contrato, ida y vuelta (S15).
  - `ProgramarViajeTest`: camino feliz, errores de negocio, falla técnica, aprobación (aprobada, rechazada o vencida) e intervención.
  - Replay del historial guardado en `src/test/resources/historiales/` (S16). Para volver a grabarlo: `./mvnw test -Dtest=ProgramarViajeTest -DgrabarHistorial=true`.
  - `ServiciosIT`: la API y el worker real contra Temporal en memoria.

## Decisiones humanas de la saga (T4.6, specs 011 y 012)

- `POST /api/v1/servicios/{servicioId}/aprobacion-credito` (solo `administracion`): exige el servicio en `PROGRAMANDO` y el workflow en `ESPERANDO_APROBACION`. Envía `aprobacionCredito` con `aprobadoPor = sub`. Al rechazar, `motivo` es obligatorio.
- `POST /api/v1/viajes/{viajeId}/intervencion` (solo `despachador`): exige el viaje en `REQUIERE_INTERVENCION` y el workflow esperando. Envía `resolverIntervencion` con `resueltoPor = sub`. Para `MARCAR_RESUELTO`, `nota` es obligatoria.
- **Idempotencia y auditoría** (`aplicacion/saga/SenalDeSaga`): la clave queda `COMPLETADA`, con la auditoría, recién cuando Temporal recibió la señal.
  - Un reenvío devuelve `202` sin volver a enviarla.
  - Si Temporal no responde, la API devuelve `503`, no se guarda nada y el reenvío con la misma clave vuelve a intentar.

## Cancelar servicio (T4.7, spec 004)

- `POST /api/v1/servicios/{servicioId}/cancelacion`: el cliente cancela solo los suyos; comercial y despachador, cualquiera.
- **Reglas de D17:**
  - se cancela solo con el viaje `CONFIRMADO` y `confirmacionCompleta`;
  - antes de eso, `409 CONFIRMACION_EN_CURSO`;
  - en ruta, `409 CANCELACION_NO_PERMITIDA`;
  - en cualquier otro estado, `409 CONFLICTO_ESTADO`.
- **En una transacción:** el viaje pasa a `CANCELADO`, se registra la auditoría y queda `ViajeCancelado` en el Outbox con `origen = USUARIO`, `canceladoPor`, `detalle` y `choferUsuarioSub`. Finanzas y Flota liberan por su cuenta (coreografía).
- La respuesta `200` se guarda para los reenvíos con la misma clave.
