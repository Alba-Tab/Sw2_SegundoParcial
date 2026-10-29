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
