# Entorno local (docker compose)

Implementa la sección 8 de `specs/plan-desarrollo.md`. Necesita Docker (OrbStack), `curl` y `jq`.

```bash
cd plataforma/compose
cp .env.example .env          # y poner MAC_LOCAL=<scutil --get LocalHostName>.local, igual en OIDC_ISSUER
docker compose --profile core --profile plataforma up -d --wait
./verificar.sh                # revisa bases, colas, realm, namespace y que todo responda
docker compose --profile core --profile plataforma down       # -v borra los datos
```

| Perfil | Servicios |
|---|---|
| `core` | postgres-aws, postgres-azure, mongo (`rs0`), dynamodb-local, s3-local (RustFS) y sus inicializaciones; viajes (8101), flota-api (8102), flota-worker, finanzas-api (8103, Octane con 4 workers) y finanzas-worker (RoadRunner con Temporal, `eventos:consumir` y `outbox:publicar`, D29) |
| `plataforma` | temporal (esquema con `admin-tools`, namespace `transporte` de 30 días), temporal-ui, rabbitmq (topología y usuarios), keycloak (realm con keycloak-config-cli + `configurar-api.sh`), n8n, mailpit |
| `trazas` | otel-collector y jaeger (D23). Los servicios exportan si `OTEL_EXPORTER_OTLP_ENDPOINT` apunta a `http://localhost:4317` |
| `simulador` | sensor de combustible ([../simulador-combustible](../simulador-combustible/README.md)), con `docker compose --profile simulador run --rm --no-deps simulador-combustible …` |
| `demo` | toxiproxy, con `--env-file .env --env-file .env.demo` para desviar Finanzas, RabbitMQ y el Gateway (N9) |

## Qué crea al arrancar

| Pieza | Inicialización |
|---|---|
| PostgreSQL | Un usuario y una base por servicio (`postgres/crear-bases.sh`). AWS: `viajes`, `temporal` y `temporal_visibility`. Azure: `finanzas`, `keycloak`, `n8n` y `analitica` |
| MongoDB | Réplica `rs0` de un nodo (la inicia el healthcheck). Desde la Mac: `?replicaSet=rs0&directConnection=true` |
| DynamoDB Local | `gps_puntos` (PK `viajeId`, SK `tsSeq`, TTL `expiraEn`) y `sync_cursor` (PK `dispositivoId`, SK `viajeId`), según la spec 005 y D55 |
| S3 local | Bucket `transporte-evidencias` y la regla de D67, si la acepta |
| RabbitMQ | La topología de `contratos/eventos/README.md` (`rabbitmq/definitions.json`: exchange `transporte.events`, 11 colas quorum con DLQ y `flota.sensor` sobre `amq.topic`), cargada por la API. Un usuario por servicio con permisos solo sobre su cola, y `sensor-sim` que solo publica en `camion.*.combustible` (D73) |
| Temporal | Esquema en PostgreSQL 17 con `temporal-sql-tool`; namespace `transporte` con 30 días (D14) |
| Keycloak | Base en postgres-azure, emisor fijo `http://$MAC_LOCAL:8080` para el navegador, el iPhone y los contenedores, y el realm de `plataforma/keycloak/` |

Todos los contenedores llevan `extra_hosts: <MAC_LOCAL>:host-gateway`, así un servicio en un contenedor valida tokens con el mismo emisor que ve el iPhone.

## Puertos

Keycloak 8080 · Temporal 7233 y UI 8233 · RabbitMQ 5672, 15672 y 1883 (MQTT) · postgres-aws 5432 · postgres-azure 5433 · Mongo 27017 · DynamoDB 8000 · S3 9000 y consola 9001 · n8n 5678 · Mailpit 8025 y 1025 · Jaeger 16686 · OTel 4317 y 4318 · Toxiproxy 8474, 25433, 25672 y 28103.

## Notas

- **S3 local:** MinIO ya no publica imágenes. Se usa RustFS 1.0.4, compatible con S3, en los mismos puertos. El *multipart* firmado (D40) se prueba contra él en T5.1.
- **Contraseñas:** `.env.example` solo trae valores locales. Las de la nube viven en los secretos de cada nube.
- **Memoria (PoC-5):** con `core`, `plataforma` y `trazas` sin servicios propios, unos 1,9 GB (Keycloak 683 MB, n8n 345 MB, RabbitMQ 188 MB).
