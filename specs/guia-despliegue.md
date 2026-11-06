# Guía de despliegue paso a paso (F3b, F11)

Complementa a [plan-despliegue.md](plan-despliegue.md) (qué va a cada nube y por qué) con el **cómo**: cuentas, regiones, recursos, configuración de cada pieza, dominio, CI/CD y monitoreo. El reparto es el de **D113**: Google Cloud solo en su prueba gratuita y su capa gratis. Las tareas son las T3b.x y T11.x de [plan-desarrollo.md](plan-desarrollo.md). Donde dice `<dominio>` va el dominio de name.com.

**Regla de oro.** Después de la primera puesta en marcha nada se despliega a mano:
- un cambio entra por PR a `develop`, y `develop` pasa a `main` por PR;
- el push a `main` despliega **solo las piezas cuya carpeta cambió**;
- ninguna nube recibe una clave guardada en GitHub: se entra con OIDC (AWS), Workload Identity Federation (GCP) y credencial federada (Azure).

## 1. Qué va dónde y en qué región

Las tres regiones quedan en el este de EE. UU. para que las llamadas entre nubes sean cortas. Azure `eastus` y AWS `us-east-1` están ambas en Virginia; GCP `us-central1` es donde aplica la capa gratis de Cloud Run.

| Nube y región | Pieza | Servicio | Nombre | URL pública |
|---|---|---|---|---|
| **AWS `us-east-1`** | Viajes (API y worker de Temporal) | EC2 t3.medium + docker compose | `transporte-vm` | `https://viajes.<dominio>` |
| | PostgreSQL de Viajes y de Temporal | contenedor en la EC2 | — | ninguna |
| | Temporal + UI | contenedor en la EC2 | — | `mq.<dominio>:7233` (mTLS); la UI solo por túnel SSM |
| | RabbitMQ (AMQP + MQTT) | contenedor en la EC2 | — | `mq.<dominio>:5671` (AMQPS) y `:8883` (MQTTS); la consola solo por túnel |
| | Caddy | contenedor en la EC2 | — | HTTPS de Viajes |
| | GPS y cursores | DynamoDB provisionado | `gps_puntos`, `sync_cursor` | — |
| | Evidencias | S3 | `transporte-evidencias-<sufijo>` | URLs firmadas |
| **GCP `us-central1`** (proyecto `appchofer-transporte`) | Flota API | Cloud Run (servicio) | `flota` | `https://flota-<n>.us-central1.run.app` |
| | Flota worker | Cloud Run (*worker pool*), **solo en pruebas y demo** | `flota-worker` | ninguna |
| | 5 webs | Firebase Hosting, plan Spark | 5 sitios | `portal.`, `tablero.`, `operaciones.`, `flota-cc.`, `finanzas-cc.<dominio>` |
| | Push al chofer (Android) | Firebase Cloud Messaging | — | — |
| **MongoDB Atlas** (en GCP Iowa, `us-central1`) | Base de Flota | M0 gratis | clúster `transporte` | ninguna |
| **Azure `eastus`** (o la región más cercana con T4) | Keycloak | Container Apps + Job `keycloak-config` | `keycloak` | `https://auth.<dominio>` |
| | Finanzas API | Container Apps | `finanzas-api` | `https://finanzas.<dominio>` |
| | Finanzas worker | Container Apps, sin ingress | `finanzas-worker` | ninguna |
| | Gateway GraphQL | Container Apps | `gateway` | `https://api.<dominio>` |
| | Servidor MCP | Container Apps, 1 réplica | `mcp-server` | `https://mcp.<dominio>` (para el Inspector) |
| | Analítica | Container Apps, 1 réplica | `analitica` | la `*.azurecontainerapps.io` |
| | n8n | Container Apps, 1 réplica, IP restringida | `n8n` | la `*.azurecontainerapps.io` |
| | LLM (Ollama, `qwen3:4b-instruct`) | Container Apps con GPU T4, **ingress interno** | `llm` | ninguna |
| | 4 bases (Finanzas, Keycloak, n8n, Analítica) | PostgreSQL Flexible B1MS | `psql-transporte-<sufijo>` | ninguna |
| **Brevo** | Correo SMTP (D37) | plan gratis (300 correos/día) | — | remitente `avisos@<dominio>` |

**No se suben:**
- Mailpit, Toxiproxy y OTel/Jaeger (D23: en la nube, logs con `correlationId`).
- El simulador de combustible, que corre desde la Mac contra `mq.<dominio>:8883`.
- La app del chofer: se instala con Xcode, con `APP_ENTORNO=nube`.

**Sobre FCM:**
- **iPhone:** no necesita nada. Con cuenta gratuita de Apple no hay push, y la app avisa sola consultando Viajes (D112).
- **Android:** sí hay que configurar el lado de Viajes (sección 6.3). Hoy no corre en ninguna parte: `FCM_PROYECTO` está vacío y Viajes registra cada aviso como `OMITIDO`.

## 2. Quién habla con quién

Esta tabla es la que garantiza que todo se interconecte. Cada flecha es una variable de la sección 7.

| Desde | Hacia | Por | Autenticación |
|---|---|---|---|
| Navegador (las 4 apps) | Gateway `https://api.<dominio>/graphql` (HTTP y WebSocket) | HTTPS | Token de Keycloak (audiencia `gateway`) |
| Navegador (portal) | Viajes `https://viajes.<dominio>` y Finanzas `https://finanzas.<dominio>` | HTTPS | Token del portal |
| Navegador y app | Keycloak `https://auth.<dominio>` | HTTPS | PKCE |
| App del chofer | Viajes, Flota (`run.app`), S3 (URL firmada), FCM | HTTPS | Token de `app-chofer` |
| Gateway y MCP (Azure) | Viajes (AWS) y Flota (GCP) por URL pública; Finanzas y Analítica por **nombre interno** (`http://finanzas-api`, `http://analitica`) | HTTPS / HTTP interno | Intercambio de token RFC 8693 |
| Analítica | MCP `http://mcp-server/mcp` y LLM `http://llm` (internos) | HTTP interno | Token del cliente `agente` / red privada del entorno |
| Todos los servicios | Keycloak `https://auth.<dominio>` (JWKS y emisor) | HTTPS | — |
| flota-worker (GCP), finanzas-worker (Azure) | Temporal `mq.<dominio>:7233` | gRPC con **mTLS** | Certificado de cliente firmado por la CA propia |
| Viajes | Temporal y RabbitMQ por la red interna de la VM | — | La red de docker |
| Flota, Finanzas, Analítica, n8n | RabbitMQ `mq.<dominio>:5671` | **AMQPS** | Usuario por servicio (sin `guest`) y la CA propia |
| Simulador (Mac) | RabbitMQ `mq.<dominio>:8883` | **MQTTS** | Usuario `sensor-sim` (solo publica, D73) |
| Flota | Atlas `mongodb+srv://…` | TLS | Usuario `flota-app` |
| Keycloak, Finanzas, n8n, Analítica | B1MS `:5432` | TLS obligatorio | Un usuario por base |
| Viajes | DynamoDB, S3 | HTTPS | Rol de la EC2 (sin claves) |
| Viajes | FCM | HTTPS | Workload Identity Federation desde el rol de la EC2 (D45) |
| Viajes | Keycloak Admin API (alta de cliente) | HTTPS | Cuenta de servicio `viajes` con FGAP (K4) |
| n8n | Brevo `smtp-relay.brevo.com:587` | STARTTLS | Usuario y clave SMTP de Brevo |

## 3. Fase A: preparar (día 1, unas 2 h)

1. **Seguridad de las cuentas:**
   - AWS: MFA en el usuario raíz, y un usuario administrador en IAM Identity Center con MFA.
   - Azure y Google: MFA o 2FA.
   - name.com: 2FA, *Domain Lock* y renovación automática.
   - GitHub: 2FA.
2. **Presupuestos con aviso por correo:**
   - AWS: Budgets en 10, 25 y 50 USD (D41).
   - Azure: presupuesto sobre el grupo `rg-transporte` en 10, 25 y 50 USD.
   - GCP: presupuesto de 1 USD en el proyecto. **No pongas cero**: el presupuesto solo avisa, no frena nada.
3. **GCP sin pagar (D113):** en la consola de Google Cloud abre el proyecto de Firebase `appchofer-transporte` y empieza la **prueba gratuita** con la tarjeta, que solo verifica identidad. **Nunca** pulses «Activar cuenta completa». Anota la fecha en que vencen los 90 días: si cae antes de la defensa, ese día los recursos se detienen.
4. **Cuota de GPU en Azure:** Portal → *Help + support* → cuota de Container Apps «Managed Environment Consumption T4 Gpus» en `eastus`. Tarda de 1 a 2 días hábiles y va por caso de soporte. Si la niegan: plan C, Ollama en la Mac con un túnel autenticado durante la defensa (D113).
5. **Etiquetas en todo recurso:** `proyecto=transporte` y `entorno=demo`.
6. **Grupos para ver todo junto:**
   - AWS: *myApplications* → aplicación `transporte` asociada por etiqueta.
   - Azure: el grupo de recursos `rg-transporte`.
   - GCP: el proyecto `appchofer-transporte`.
7. **Secretos nuevos para la nube:** genera cada uno con `openssl rand -base64 32` y guárdalos en tu gestor de contraseñas. Nunca uses los de `.env.example` ni `Clave123!`. Son:
   - `KC_SECRETO_*` (uno por cliente de Keycloak), `KC_CLAVE_SEMILLA`, el administrador de Keycloak;
   - las claves de RabbitMQ (una por servicio), de las 4 bases de Azure, de PostgreSQL de Viajes y de Atlas;
   - `APP_KEY` de Finanzas, `N8N_ENCRYPTION_KEY` y `EXPORTACION_HMAC_SECRETO`.

## 4. Fase B: código que falta antes de desplegar

Nada de esto existe todavía. Va en ramas desde `develop`, con sus pruebas, y entra por PR.

| # | Qué | Piezas | Rama |
|---|---|---|---|
| B1 | **TLS hacia Temporal** (mTLS: CA, certificado y clave de cliente por variable) | flota (`@temporalio/worker`), finanzas (`.rr.yaml`, sección `tls`), viajes (cliente de Temporal) | `feat/<pieza>/tls-temporal` |
| B2 | **AMQPS hacia RabbitMQ** (puerto 5671, CA propia) | flota (`amqps://`), finanzas (conexión SSL de php-amqplib), analitica (`amqps://` con contexto SSL), n8n (credencial con SSL, en `plataforma/n8n/importar.sh`) | `feat/<pieza>/amqps` |
| B3 | Compose de la VM: Caddy, Viajes, PostgreSQL, Temporal con TLS y `requireClientAuth`, Temporal UI, RabbitMQ con 5671 y 8883 (5672 solo dentro de la red de docker), respaldo diario de PostgreSQL a S3 | `plataforma/vm/` | `feat/plataforma/vm-aws` |
| B4 | La CA propia y los certificados (servidor de Temporal y RabbitMQ; clientes `flota-worker`, `finanzas-worker` y `viajes`) | `plataforma/vm/certificados.sh` | `feat/plataforma/vm-aws` |
| B5 | Imagen del Job `keycloak-config` (keycloak-config-cli, `curl`, `jq` y `aplicar-realm.sh`) | `plataforma/keycloak/` | `feat/plataforma/keycloak-nube` |
| B6 | Imagen del LLM: Ollama parchado (CVE-2026-7482) con `qwen3:4b-instruct` ya descargado | `plataforma/llm/` | `feat/plataforma/llm-gpu` |
| B7 | `configuracion.json` de nube de las 4 apps y `VITE_*` del portal en el build | `frontends/` | `ci/ci/deploy-firebase` |
| B8 | Workflows (sección 9) | `.github/workflows/` | `ci/ci/deploy-*` |
| B9 | `encender-demo.sh` y `apagar-demo.sh` | `plataforma/scripts/` | `feat/plataforma/scripts-encender-apagar` |
| B10 | `--nube` en `reiniciar-demo.sh` y `escenario-completo.sh` (tokens por *device grant*, D39) | `plataforma/scripts/` | `chore/plataforma/config-nube` |

## 5. Fase C: AWS (T3b.1)

| Recurso | Configuración |
|---|---|
| ECR | Repositorio privado `transporte/viajes`, escaneo al subir y regla de ciclo de vida que conserva las 10 últimas |
| S3 | `transporte-evidencias-<sufijo>`: Block Public Access completo, cifrado SSE-S3, política que niega lo que no sea TLS, la regla de D67, y CORS solo con `GET` y `PUT` desde los 5 dominios de Firebase |
| DynamoDB | `gps_puntos` (PK `viajeId`, SK `tsSeq`, TTL `expiraEn`) y `sync_cursor` (PK `dispositivoId`, SK `viajeId`), provisionadas dentro de la capa gratuita |
| Parameter Store | `SecureString` bajo `/transporte/`: claves de PostgreSQL y RabbitMQ, `KC_SECRETO_VIAJES` y las claves privadas de los certificados |
| Rol `transporte-vm-role` | `AmazonSSMManagedInstanceCore` + una política propia: leer de ECR; leer y escribir solo las 2 tablas y el bucket; `ssm:GetParameters*` solo en `/transporte/*`; CloudWatch Logs |
| Grupo de seguridad `transporte-vm-sg` | Entrada: 80 y 443 (Caddy), 5671, 8883 y 7233. **El 22 cerrado**: se entra con *Session Manager* |
| EC2 `transporte-vm` | t3.medium, Amazon Linux 2023, EBS gp3 30 GB cifrado, **IMDSv2 obligatorio**, el rol de arriba, Docker y el plugin de compose |
| IP elástica | Asociada a la EC2 |
| CloudWatch | Grupo `/transporte/vm` (driver `awslogs`, retención 14 días) y alarma de *status check* |
| OIDC para GitHub | Proveedor `token.actions.githubusercontent.com` (audiencia `sts.amazonaws.com`) y rol `transporte-gha-deploy` que **solo** confía en `repo:Alba-Tab/Sw2_SegundoParcial:environment:aws`. Permisos: subir a `transporte/viajes` y `ssm:SendCommand` solo a instancias con `proyecto=transporte` |

## 6. Fase D: Azure y GCP

### 6.1 Azure (T11.1 a T11.7)

| Recurso | Configuración |
|---|---|
| Grupo de recursos | `rg-transporte` en `eastus`, con las etiquetas |
| Log Analytics | `log-transporte`, retención 30 días |
| PostgreSQL Flexible | `psql-transporte-<sufijo>`, Burstable **B1MS**, PostgreSQL 17, 32 GB, misma región. Red: acceso público con **solo** «Allow public access from any Azure service» (más tu IP mientras configuras). TLS obligatorio. Bases y usuarios: `finanzas`, `keycloak`, `n8n` y `analitica`, cada usuario dueño solo de su base |
| Entorno de Container Apps | `cae-transporte`, con *workload profiles*: Consumption para todo y `gpu-t4` (`Consumption-GPU-NC8as-T4`) cuando aprueben la cuota |
| Identidad `id-gha-transporte` | Identidad administrada con credencial federada: emisor `https://token.actions.githubusercontent.com`, sujeto `repo:Alba-Tab/Sw2_SegundoParcial:environment:azure`. Rol **Contributor solo sobre `rg-transporte`** |
| Imágenes | GHCR del repo. El repo es público y las imágenes no llevan secretos: lo verifican gitleaks y el realm, que solo trae `$(env:...)` |
| Presupuesto | Sobre `rg-transporte` |

### 6.2 GCP y Firebase (T3b.3, T3b.4)

Todo en el proyecto `appchofer-transporte`, que ya es el de Firebase y el de la app.

1. Habilitar las APIs: Cloud Run, Artifact Registry, Secret Manager, IAM Credentials, Security Token Service, Firebase Hosting y FCM.
2. Artifact Registry: repositorio Docker `transporte` en `us-central1`, con una política de limpieza que conserve las 5 últimas (el almacenamiento gratis es de 0,5 GB).
3. Cuenta de servicio de ejecución `sa-flota`, que solo lee sus secretos.
4. Secret Manager: URI de Atlas, clave de RabbitMQ de Flota, certificado y clave de cliente de Temporal de `flota-worker`, y la CA propia.
5. **Atlas M0** en GCP Iowa (`us-central1`):
   - clúster `transporte` y usuario `flota-app` con `readWrite` solo sobre `flota`;
   - lista de acceso `0.0.0.0/0`, porque Cloud Run no tiene IP fija; lo compensan TLS y el usuario fuerte (T3b.3).
6. **Cloud Run:**
   - `flota`: mínimo 0, máximo 2, facturación por petición.
   - `flota-worker`: *worker pool* con 1 instancia **solo en pruebas y demo**, y 0 el resto del tiempo.

   No pude confirmar que el *worker pool* entre en la capa gratis: revisa la página de precios. Si se cobra, plan B: correr el worker como otro contenedor en la EC2, junto a Temporal (D113).
7. **Firebase Hosting:** 5 sitios (`transporte-portal`, `transporte-tablero`, `transporte-operaciones`, `transporte-flota`, `transporte-finanzas`), cada uno con su dominio propio (sección 8).
8. **CI/CD:**
   - Pool de Workload Identity `github`, con proveedor OIDC `https://token.actions.githubusercontent.com`.
   - Condición: `assertion.repository == 'Alba-Tab/Sw2_SegundoParcial' && assertion.environment == 'gcp'`.
   - Cuenta `gha-deploy` con `artifactregistry.writer`, `run.developer`, `iam.serviceAccountUser` (solo sobre `sa-flota`) y `firebasehosting.admin`.

### 6.3 FCM para Android (D45)

1. En el mismo proyecto: pool de Workload Identity `aws` con un proveedor de tipo **AWS** y tu número de cuenta de AWS.
2. Cuenta `sa-fcm` con el rol de administrador de la API de FCM, y `workloadIdentityUser` para el rol `transporte-vm-role` de la EC2 (atributo `aws_role`).
3. Generar la configuración de credencial con `gcloud iam workload-identity-pools create-cred-config …/providers/aws --service-account=sa-fcm@… --aws --enable-imdsv2 --output-file=fcm.json`. **No tiene secretos**: dice cómo cambiar la identidad de la EC2 por un token de Google.
4. En Viajes: `FCM_PROYECTO=appchofer-transporte` y `GOOGLE_APPLICATION_CREDENTIALS` apuntando a ese `fcm.json`.
5. La app de Android usa el `google-services.json` que ya tienes (fuera del repo, secreto del build).

## 7. Configuración de cada pieza en la nube

Solo cambia lo que difiere del compose local. Los secretos van al almacén de cada nube (Parameter Store, Secret Manager o los secretos de Container Apps), **nunca** en el workflow. `<KC>` es `https://auth.<dominio>/realms/transporte`. `<WEB>` es la lista de los 5 dominios de Firebase: `https://portal.<dominio>,https://tablero.<dominio>,https://operaciones.<dominio>,https://flota-cc.<dominio>,https://finanzas-cc.<dominio>`.

| Pieza | Variables (además de los secretos) |
|---|---|
| **viajes** | `OIDC_ISSUER=<KC>`, `DB_URL=jdbc:postgresql://postgres:5432/viajes`, `AMQP_HOST=rabbitmq`, `TEMPORAL_ADDRESS=temporal:7233` + TLS (B1), `AWS_REGION=us-east-1`, **sin** `AWS_ACCESS_KEY_ID` (usa el rol), **sin** `GPS_DYNAMODB_ENDPOINT` ni `S3_ENDPOINT` (usa los de AWS), `S3_BUCKET=transporte-evidencias-<sufijo>`, `CORS_ORIGENES=<WEB>`, `FCM_PROYECTO=appchofer-transporte`, `GOOGLE_APPLICATION_CREDENTIALS=/secretos/fcm.json` |
| **flota** | `OIDC_ISSUER=<KC>`, `MONGO_URI=mongodb+srv://flota-app:…@transporte.<id>.mongodb.net/flota`, `AMQP_URL=amqps://flota:…@mq.<dominio>:5671` + CA (B2), `CORS_ORIGENES=<WEB>` |
| **flota-worker** | Lo mismo que flota, más `TEMPORAL_ADDRESS=mq.<dominio>:7233` y el certificado de cliente (B1) |
| **keycloak** | Comando `start` (no `start-dev`), `KC_HOSTNAME=https://auth.<dominio>`, `KC_PROXY_HEADERS=xforwarded`, `KC_HTTP_ENABLED=true` (el TLS termina en el ingress), `KC_HEALTH_ENABLED=true`, `KC_DB_URL=jdbc:postgresql://psql-transporte-<sufijo>.postgres.database.azure.com:5432/keycloak?sslmode=require`, `KC_DB_POOL_MAX_SIZE=7` |
| **keycloak-config** (Job) | Todos los `KC_SECRETO_*` y `KC_CLAVE_*`, `KC_URL_CC_TABLERO=https://tablero.<dominio>`, `KC_URL_CC_OPERACIONES=https://operaciones.<dominio>`, `KC_URL_CC_FLOTA=https://flota-cc.<dominio>`, `KC_URL_CC_FINANZAS=https://finanzas-cc.<dominio>`, `KC_URL_PORTAL=https://portal.<dominio>`, `KC_SSL_REQUIRED=external`, `KC_DEMO_CLI_DIRECT_GRANT=false`, `KC_ACCESS_TOKEN_SEG=300` |
| **finanzas-api** | `APP_ENV=production`, `OIDC_ISSUER=<KC>`, `DB_HOST=psql-transporte-<sufijo>.postgres.database.azure.com` con `sslmode=require`, `AMQP_HOST=mq.<dominio>`, `AMQP_PORT=5671` + CA (B2), `TEMPORAL_ADDRESS=mq.<dominio>:7233`, `PORTAL_URL=https://portal.<dominio>`, `CORS_ORIGENES=<WEB>` |
| **finanzas-worker** | Lo mismo que finanzas-api, más el certificado de cliente de Temporal (B1). Su comando corre `php artisan migrate --force`, así que migra antes de servir |
| **gateway** | `OIDC_ISSUER=<KC>`, `VIAJES_URL=https://viajes.<dominio>`, `FLOTA_URL=<URL run.app de flota>`, `FINANZAS_URL=http://finanzas-api`, `ANALITICA_URL=http://analitica`, `GATEWAY_URL=https://api.<dominio>` (enlaces de Excel y PDF), `CORS_ORIGENES` con los 4 dominios del Centro de Control |
| **mcp-server** | `OIDC_ISSUER=<KC>`, las mismas 4 URLs que el Gateway y `MCP_CLIENTES=agente` |
| **analitica** | `OIDC_ISSUER=<KC>`, `DATABASE_URL=postgresql+psycopg://analitica:…@psql-transporte-<sufijo>.postgres.database.azure.com:5432/analitica?sslmode=require`, `AMQP_URL=amqps://analitica:…@mq.<dominio>:5671/` (B2), `MCP_URL=http://mcp-server/mcp`, `LLM_BASE_URL=http://llm`, `LLM_TURNO_S=20` (D85), `MISION_CADA_MINUTOS=0` fuera de la demo y `10` durante ella, `PORTAL_URL=https://portal.<dominio>`, `CORS_ORIGENES` con los 4 dominios del Centro de Control |
| **n8n** | `DB_POSTGRESDB_HOST=psql-transporte-<sufijo>.postgres.database.azure.com` con SSL, `AMQP_HOST=mq.<dominio>`, `AMQP_PORT=5671` (B2), `N8N_SMTP_HOST=smtp-relay.brevo.com`, `N8N_SMTP_PORT=587`, `N8N_SMTP_SENDER=avisos@<dominio>`, `GENERIC_TIMEZONE=America/La_Paz` |
| **llm** | Puerto 11434, perfil `gpu-t4`, ingress **interno**, réplicas 0 a 1 |
| **4 apps del Centro de Control** | `configuracion.json`: `oidcIssuer=<KC>`, `gatewayUrl=https://api.<dominio>`, `jaegerUrl` vacío y `urls` con los 5 dominios |
| **portal** | En el build: `VITE_OIDC_ISSUER=<KC>`, `VITE_VIAJES_URL=https://viajes.<dominio>`, `VITE_FINANZAS_URL=https://finanzas.<dominio>`, `VITE_CENTRO_URL=https://tablero.<dominio>` |
| **app del chofer** | `APP_ENTORNO=nube`, `APP_VIAJES_URL=https://viajes.<dominio>`, `APP_FLOTA_URL=<URL run.app de flota>`, `APP_OIDC_ISSUER=<KC>` |

**Réplicas en Azure:**

| Fijo en 1 | De 0 a 1 | De 0 a 2 |
|---|---|---|
| `keycloak` y `finanzas-worker` (y `analitica` si la misión programada está activa) | `n8n`, `mcp-server`, `llm` | `finanzas-api`, `gateway` |

**Conexiones a la B1MS:** Keycloak 7, n8n 5, Finanzas 8 y Analítica 5. Gateway y MCP no tienen base, así que el total sigue siendo el del plan: 25, o 33 en el peor caso durante un redespliegue, dentro de las ~35 útiles.

## 8. Fase E: DNS en name.com

Domain → *Manage DNS Records*. Usa TTL de 300 s mientras configuras.

| Host | Tipo | Valor | Para |
|---|---|---|---|
| `viajes` | A | IP elástica | Caddy saca el certificado de Let's Encrypt solo |
| `mq` | A | IP elástica | Temporal, AMQPS y MQTTS (CA propia) |
| `auth`, `finanzas`, `api`, `mcp` | CNAME | FQDN de cada Container App | Keycloak, Finanzas, Gateway, MCP |
| `asuid.auth`, `asuid.finanzas`, `asuid.api`, `asuid.mcp` | TXT | id de verificación del entorno | validación del dominio en Azure (certificado gratis) |
| `portal`, `tablero`, `operaciones`, `flota-cc`, `finanzas-cc` | lo que indique Firebase | — | las 5 webs (certificado gratis) |
| `@` | *URL Forwarding* de name.com | `https://portal.<dominio>` | el dominio sin subdominio |
| Brevo | TXT y CNAME | SPF, DKIM y `_dmarc` (`v=DMARC1; p=none; rua=mailto:<tu correo>`) | que los correos de n8n no caigan en spam |

No agregues registros CAA: los certificados salen de tres emisores (Let's Encrypt, Google y DigiCert para Azure) y un CAA incompleto rompe las renovaciones.

**Flota sin dominio propio.** El mapeo de dominios de Cloud Run sigue en *preview* y solo lo llaman el Gateway y la app, así que se usa su URL `run.app`, que ya es HTTPS y no cambia mientras exista el servicio.

## 9. Fase F: GitHub y el despliegue automático

1. **Environments** `aws`, `gcp` y `azure` (Settings → Environments):
   - *Deployment branches* → solo `main`.
   - Opcional: *Required reviewers* contigo, para aprobar cada despliegue con un clic.
2. **Variables** de cada environment. No son secretas; los secretos viven en las nubes.

   | Environment | Variables |
   |---|---|
   | `aws` | `AWS_ROLE_ARN`, `AWS_REGION=us-east-1` |
   | `gcp` | `GCP_PROYECTO=appchofer-transporte`, `GCP_WIF_PROVIDER`, `GCP_SA` |
   | `azure` | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RG=rg-transporte` |

3. **Protección de `main`**, igual que `develop`: PR obligatorio y check `ci-ok`.
4. **Workflows:**
   - Reutilizables: `_build-push-image`, `_deploy-ec2`, `_deploy-cloudrun`, `_deploy-containerapp`, `_deploy-firebase` y `_smoke`.
   - Uno por pieza, con `on: push: branches: [main]` y `paths:` de su carpeta, sus contratos y `libs/` cuando aplica.
   - Permisos mínimos: `id-token: write` y `contents: read`.
   - Imagen etiquetada con `${{ github.sha }}`, nunca `latest`.
   - Cada uno termina con un *smoke* a `/health/ready`.

   | Workflow | Se dispara con | Despliega en |
   |---|---|---|
   | `viajes` | `servicios/viajes/**`, `contratos/openapi/viajes.yaml`, `contratos/eventos/**`, `contratos/temporal/**` | ECR → SSM → `docker compose up -d viajes` en la EC2 |
   | `plataforma-vm` | `plataforma/vm/**` | SSM → `docker compose up -d` |
   | `flota` | `servicios/flota/**` y sus contratos | Artifact Registry → Cloud Run (`flota` y `flota-worker`) |
   | `finanzas` | `servicios/finanzas/**` y sus contratos | GHCR → `finanzas-api` y `finanzas-worker` |
   | `analitica` | `servicios/analitica/**`, `contratos/openapi/analitica.yaml`, eventos | GHCR → `analitica` (entrena el `.joblib` en el build) |
   | `gateway` | `servicios/gateway/**`, `libs/intercambio-token/**`, `contratos/graphql/**`, `contratos/openapi/**` | GHCR → `gateway` |
   | `mcp-server` | `servicios/mcp-server/**`, `libs/intercambio-token/**`, `contratos/mcp/**`, `contratos/openapi/**` | GHCR → `mcp-server` |
   | `keycloak` | `plataforma/keycloak/**` | Imagen del Job y `az containerapp job start keycloak-config` |
   | `n8n` | `plataforma/n8n/**` | Job de importación de flujos |
   | `llm` | `plataforma/llm/**` | GHCR → `llm` |
   | `cc-*` (4) | `frontends/centro-control/projects/<app>/**`, `ui-comun/**`, `libs/design-tokens/**`, `contratos/graphql/**` | `firebase deploy --only hosting:<sitio>` |
   | `portal` | `frontends/portal-cliente/**`, tokens, OpenAPI de viajes y finanzas | Firebase |

5. **Volver atrás:** volver a desplegar el SHA anterior. Cloud Run y Container Apps guardan revisiones (se devuelve el tráfico desde la consola); en la EC2 es `docker compose up -d` con la etiqueta anterior.

Esqueleto de uno (Azure; los de AWS y GCP cambian solo el *login* y el comando final):

```yaml
name: gateway
on:
  push:
    branches: [main]
    paths: ['servicios/gateway/**', 'libs/intercambio-token/**', 'contratos/graphql/**', 'contratos/openapi/**']
permissions: { id-token: write, contents: read, packages: write }
jobs:
  desplegar:
    runs-on: ubuntu-latest
    environment: azure
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: '${{ github.actor }}', password: '${{ secrets.GITHUB_TOKEN }}' }
      - uses: docker/build-push-action@v6
        with: { context: ., file: servicios/gateway/Dockerfile, push: true, tags: 'ghcr.io/alba-tab/gateway:${{ github.sha }}' }
      - uses: azure/login@v2
        with: { client-id: '${{ vars.AZURE_CLIENT_ID }}', tenant-id: '${{ vars.AZURE_TENANT_ID }}', subscription-id: '${{ vars.AZURE_SUBSCRIPTION_ID }}' }
      - run: az containerapp update -g ${{ vars.AZURE_RG }} -n gateway --image ghcr.io/alba-tab/gateway:${{ github.sha }}
      - run: curl -fsS --retry 10 --retry-delay 6 https://api.<dominio>/health/ready
```

## 10. Fase G: orden de la primera puesta en marcha

Cada paso tiene su prueba; no sigas al siguiente sin ella.

| # | Paso | Cómo se comprueba |
|---|---|---|
| 1 | Fases A y B terminadas y en `main` | CI en verde |
| 2 | AWS: EC2 con el compose de la VM; DNS de `viajes` y `mq` | Desde la Mac, `openssl s_client -connect mq.<dominio>:5671` muestra la CA propia y Temporal acepta mTLS con un certificado de cliente (T3b.1) |
| 3 | Azure: B1MS con sus 4 bases, entorno, Keycloak con `auth.<dominio>` y el Job `keycloak-config` | `https://auth.<dominio>/realms/transporte/.well-known/openid-configuration` responde y entra un usuario por rol (T11.3) |
| 4 | Viajes por su pipeline, con `OIDC_ISSUER` en `auth.` | *Smoke* `https://viajes.<dominio>/health/ready` (T3b.2) |
| 5 | GCP: Atlas, `flota` y `flota-worker` | La Temporal UI (por túnel) muestra el worker de `flota` (T3b.4) |
| 6 | Azure: `finanzas-api` y `finanzas-worker` | El worker aparece en la cola `finanzas` (T11.4) |
| 7 | Azure: `mcp-server` y `analitica` | Una misión manual termina `COMPLETADA` o `SALTADA` sin LLM (T11.5) |
| 8 | Azure: `n8n` y Brevo | Llega un correo real a tu buzón (T11.6) |
| 9 | Azure: `llm` con la GPU | Responde en menos de 10 s ya despierto; desde afuera no responde (T11.7) |
| 10 | Azure: `gateway` en `api.<dominio>` | La suscripción de alertas funciona y el Inspector conecta a `mcp.<dominio>` (T11.8) |
| 11 | Firebase: las 5 webs y sus dominios | Salto de SSO entre las apps (T11.9) |
| 12 | Túneles SSM a la Temporal UI (8233) y a la consola de RabbitMQ (15672) | No responden desde internet (T11.10) |
| 13 | Semilla en la nube | `reiniciar-demo.sh --nube` en verde (T11.11) |
| 14 | Escenario completo | `escenario-completo.sh --nube` en verde y `pg_stat_activity` con 35 conexiones o menos, también durante un redespliegue (T11.12) |
| 15 | App del chofer con `APP_ENTORNO=nube` en el iPhone | Inicia un viaje y sincroniza |

## 11. Monitoreo, costos y apagado

| Qué | Dónde |
|---|---|
| Vista por nube | AWS *myApplications* `transporte`; GCP el proyecto; Azure el grupo `rg-transporte` (*Cost analysis* e *Insights*) |
| Salud de todo en un lugar | **Uptime checks** de Cloud Monitoring (gratis dentro de su cuota) contra el `/health/ready` público de Viajes, Finanzas, Gateway y Flota, el `.well-known/openid-configuration` de Keycloak (su salud está en un puerto que no sale por el ingress) y la portada de cada web, con alerta por correo |
| Logs | CloudWatch (`/transporte/vm`), Cloud Logging (Cloud Run) y Log Analytics (Container Apps). Se buscan por `correlationId` (D23) |
| Alertas | *Status check* de la EC2, reinicios y 5xx en Container Apps, errores de Cloud Run |

**`apagar-demo.sh`** (y `encender-demo.sh` a la inversa):
1. Detiene la EC2. La IP elástica y el disco igual se cobran, unos 6 USD/mes del crédito.
2. Pone `flota-worker` en 0.
3. Pone todas las Container Apps en 0 réplicas, incluidos `keycloak` y `finanzas-worker`.
4. Detiene la B1MS (Azure la vuelve a encender sola a los 7 días).

**El LLM:** escala a cero, pero la misión cada 10 min lo mantiene despierto y cobrando. Fuera de la demo, `MISION_CADA_MINUTOS=0`; la misión se dispara a mano.

## 12. LLM, agentes de Google y Claude

- **El agente sigue con LLM propio** (D36, D113). La propuesta lo exige: «LLM propio: ningún dato va a proveedores de IA de terceros» (requisito 10). Gemini o un agente de Vertex AI cambiarían la propuesta.
- **Conectar el MCP a un chat de Claude:** hoy no se puede sin código. El servidor no publica `/.well-known/oauth-protected-resource` y solo acepta el `azp` del cliente `agente`. Además, los datos irían a un tercero. Para la defensa, el MCP Inspector contra `mcp.<dominio>` ya demuestra la interoperabilidad (FM1).
