# VM de AWS (B3, B4, D113)

Lo que corre en la EC2 `transporte-vm`: Viajes, su PostgreSQL, Temporal y su UI, RabbitMQ y Caddy. El resto de las piezas llega por internet a `mq.<dominio>` con la CA propia.

| Servicio | Hacia afuera | Seguridad |
|---|---|---|
| `postgres` | nada | Bases `viajes`, `temporal` y `temporal_visibility`, un usuario por base (`../compose/postgres/crear-bases.sh`) |
| `temporal` | `7233` | mTLS con `requireClientAuth`, en el frontend y entre los servicios internos. Solo entra un certificado firmado por la CA propia |
| `temporal-ui` | `127.0.0.1:8233` | Certificado `cliente-temporal-ui`. Se entra por túnel de SSM |
| `rabbitmq` | `5671` (AMQPS), `8883` (MQTTS), `127.0.0.1:15672` (consola) | El 5672 en claro solo existe en la red de docker (Viajes). MQTT en claro apagado. Sin `guest`: administrador de `RABBITMQ_ADMIN` y un usuario por servicio (`../compose/iniciar/rabbitmq-usuarios.sh`) |
| `viajes` | por Caddy | Imagen de ECR por SHA (`VIAJES_IMAGEN`), certificado `cliente-viajes`, DynamoDB y S3 con el rol de la EC2 |
| `caddy` | `80`, `443` | `viajes.<dominio>` con Let's Encrypt (`CADDY_TLS` = correo de ACME) |

Los servicios largos mandan sus logs a CloudWatch (`/transporte/vm`, driver `awslogs`, un *stream* por contenedor). La VM tiene el repo clonado: el compose reusa `../compose/postgres`, `../compose/temporal`, `../compose/rabbitmq` y `../compose/iniciar`.

**Fuera de alcance:** el respaldo diario de PostgreSQL a S3 (lo descartó T11.10; la guía §4 todavía lo menciona en B3).

## Certificados (B4)

```bash
./certificados.sh <dominio>      # en la Mac; salida en certs/ (ignorado por git)
```

| Archivo | Para | Va a |
|---|---|---|
| `ca.pem` | Todos los clientes y servidores | Parameter Store, Secret Manager (GCP), secretos de Container Apps |
| `ca.key` | Firmar | **Solo la Mac** (gestor de contraseñas). Regenerar la CA invalida todos los certificados |
| `servidor.pem/.key` | Temporal y RabbitMQ. SAN `mq.<dominio>`, `temporal`, `rabbitmq`, `localhost` | Parameter Store |
| `cliente-viajes`, `cliente-temporal-ui`, `cliente-admin` | Clientes de Temporal en la VM | Parameter Store |
| `cliente-flota-worker` | Worker de Flota (Cloud Run) | Secret Manager |
| `cliente-finanzas-worker` | Worker de Finanzas (Container Apps) | Secretos de Container Apps |

El script es idempotente: no regenera la CA ni un certificado que exista, salvo el del servidor si cambia el dominio. Los de hoja duran 825 días.

## En la EC2

```bash
./cargar-secretos.sh                                   # .env y certs/ desde Parameter Store
echo "VIAJES_IMAGEN=<ecr>/transporte/viajes:<sha>" > .env.imagen   # lo escribe el despliegue
docker compose --env-file .env --env-file .env.imagen up -d
```

`cargar-secretos.sh` lee `/transporte/env/<VARIABLE>` (una línea del `.env`; las claves como `SecureString`) y `/transporte/certs/<archivo>` (un archivo de `certs/`). Las variables son las de `.env.example`, con `DOMINIO`, `CADDY_TLS` y `OIDC_ISSUER` de la nube y las claves nuevas (guía §3.7).

**IMDSv2:** para que Viajes use el rol de la EC2 desde su contenedor, el límite de saltos de los metadatos (`HttpPutResponseHopLimit`) debe ser 2.

## Prueba en la Mac (B12)

Cierra B1 a B4 sin pagar la EC2. La VM corre con `prueba/vm.yaml` encima (logs a docker, DynamoDB y S3 locales); los servicios del compose local, con `prueba/servicios.yaml`, salen hacia `mq.localhost` (la Mac, que está en el SAN) con mTLS y AMQPS, como en la nube.

```bash
./certificados.sh localhost
cp .env.example .env            # OIDC_ISSUER y MAC_LOCAL como en ../compose/.env
# Imágenes con B1 y B2: transporte/{viajes,flota,finanzas,analitica}:b12
docker compose -f compose.yaml -f prueba/vm.yaml up -d --wait

cd ../compose                   # sin temporal ni rabbitmq propios: los de la VM
docker compose up -d --wait postgres-azure mongo dynamodb-local s3-local keycloak mailpit
docker compose up aws-local-iniciar keycloak-config keycloak-realm n8n-inbox
docker compose -f compose.yaml -f ../vm/prueba/servicios.yaml up -d --no-deps \
  flota-api flota-worker finanzas-api finanzas-worker analitica
docker compose -f compose.yaml -f ../vm/prueba/servicios.yaml up --no-deps n8n-importar
```

Qué se comprueba:

1. La Temporal UI (`http://localhost:8233`) muestra los workers de las colas `flota`, `finanzas` y `viajes`.
2. Un cliente sin certificado es rechazado: `temporal operator cluster health --address localhost:7233 --tls --tls-ca-path certs/ca.pem`.
3. `openssl s_client -connect localhost:5671 -CAfile certs/ca.pem` muestra la CA propia y `Verify return code: 0`.
4. Un viaje programado termina: cotizar y confirmar con Agroexport (pasos 2 y 3 de `escenario-completo.sh`).
5. `rabbitmqctl list_connections user ssl` da `true` para `flota`, `finanzas`, `analitica` y `n8n`, y `false` para `viajes` (red de docker).
