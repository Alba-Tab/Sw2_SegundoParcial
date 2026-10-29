# AGENTS.md: Viajes (Spring Boot 4.1, Java 25, hexagonal)

Manda dentro de `servicios/viajes/`; lo demás está en el AGENTS.md de la raíz.

## Capas (ArchUnit las verifica en `ArquitecturaTest`)

| Paquete | Qué va | Puede usar |
|---|---|---|
| `dominio` | Entidades, value objects (`Monto`), reglas e invariantes; `ErrorDeDominio` con el código de 000 §5 | Solo Java. Nada de Spring, Jakarta, Jackson, Hibernate ni Temporal |
| `aplicacion` | Casos de uso y **puertos** (`aplicacion.puerto.entrada` y `.salida`) | `dominio`. Sin AMQP, JDBC, web ni AWS |
| `adaptadores.entrada` | REST (`web`), actividades de Temporal, consumidores de eventos | `aplicacion`, `dominio` |
| `adaptadores.salida` | Persistencia (JDBC/JPA, Flyway), Outbox y su relay, DynamoDB, S3, Keycloak, FCM | `aplicacion`, `dominio` |
| `configuracion` | Seguridad, logs, propiedades, wiring | Todo |

## Reglas propias

- Un evento se publica **solo** con `RegistroDeEventos.registrar(...)` dentro de la transacción del caso de uso (`Propagation.MANDATORY`); el relay lo publica después del commit.
- Errores: lanzar `ErrorDeDominio(codigo, mensaje)`; `ManejadorDeProblemas` lo convierte en Problem Details con su estado.
- Migraciones nuevas en `src/main/resources/db/migration/V<n>__<que>.sql`; nunca editar una aplicada.
- Contratos primero: `contratos/openapi/viajes.yaml` y `contratos/temporal/` antes del código. Las interfaces REST (`adaptadores.entrada.web.api.*Api`) y sus DTO (`...api.modelo.*Dto`) los genera openapi-generator en cada build (`target/generated-sources/openapi`, no se versionan): un controlador nuevo **implementa** la interfaz generada en lugar de declarar sus propias rutas. Si el contrato cambia, deja de compilar. Los DTO no entran al dominio: el controlador los traduce.

## Comandos

```bash
./mvnw verify          # unitarias, ArchUnit e integración con Testcontainers (PostgreSQL 17 y RabbitMQ 4.4)
./mvnw spring-boot:run # contra el compose local (variables en .env.example)
```

Con OrbStack, Testcontainers necesita `DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock` y `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`.
