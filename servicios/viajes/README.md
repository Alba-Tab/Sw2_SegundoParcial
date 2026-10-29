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
./mvnw verify                                            # 13 pruebas
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

