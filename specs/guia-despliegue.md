# Guía de despliegue

Cómo está desplegado el sistema y cómo operarlo. El reparto y sus motivos están en [plan-despliegue.md](plan-despliegue.md). Dominio: `albas.dev` (name.com).

## 1. Qué hay y dónde

| Nube y región | Pieza | Servicio | Recurso | URL |
|---|---|---|---|---|
| **AWS `us-east-2`** (D115) | Viajes | EC2 `m7i-flex.large` + docker compose | `transporte-vm` (IP `3.140.206.135`) | `https://viajes.albas.dev` |
| | PostgreSQL de Viajes y Temporal | contenedor en la EC2 | — | ninguna |
| | Temporal + UI | contenedor en la EC2 | — | `mq.albas.dev:7233` (mTLS); UI solo por túnel SSM |
| | RabbitMQ | contenedor en la EC2 | — | `mq.albas.dev:5671` (AMQPS) y `:8883` (MQTTS); consola solo por túnel |
| | Caddy | contenedor en la EC2 | — | HTTPS de Viajes |
| | GPS y cursores | DynamoDB | `gps_puntos`, `sync_cursor` | — |
| | Evidencias | S3 | `transporte-evidencias-albas` | URLs firmadas |
| | Imágenes | ECR | `transporte/viajes` | — |
| **GCP `us-central1`** (`appchofer-transporte`) | Flota API | Cloud Run | `flota` | `https://flota-424116639960.us-central1.run.app` |
| | Flota worker | Cloud Run worker pool | `flota-worker` | ninguna |
| | Push Android | FCM | **sin configurar** (§8) | — |
| **MongoDB Atlas** (GCP Iowa) | Base de Flota | M0 | `transporte` | ninguna |
| **Azure `eastus`** (`rg-transporte`, entorno `cae-transporte`) | Keycloak | Container App | `keycloak` | `https://auth.albas.dev` |
| | Finanzas API y worker | Container Apps | `finanzas-api`, `finanzas-worker` | `https://finanzas.albas.dev` |
| | Gateway GraphQL | Container App | `gateway` | `https://api.albas.dev` |
| | Servidor MCP | Container App | `mcp-server` | `https://mcp.albas.dev` |
| | Analítica | Container App | `analitica` | `https://analitica.ambitiouswater-ac4b34d9.eastus.azurecontainerapps.io` |
| | n8n | Container App, sin ingress | `n8n` | ninguna |
| | LLM | **no existe**: cuota de GPU en 0 (§8) | — | — |
| **Azure `eastus2`** | 4 bases: finanzas, keycloak, n8n, analitica | PostgreSQL General Purpose `D2ds_v5` (D115) | `psql-transporte-sw2bg-gp` | ninguna |
| | 5 webs (D114) | Static Web Apps Free | `swa-portal`, `swa-tablero`, `swa-operaciones`, `swa-flota-cc`, `swa-finanzas-cc` | `portal.`, `tablero.`, `operaciones.`, `flota-cc.`, `finanzas-cc.albas.dev` |
| **Brevo** | Correo SMTP (D37) | plan gratis | remitente `avisos@albas.dev` | — |

**Réplicas durante la demo** (fijadas por `encender-demo.sh`): 1 en `keycloak`, `finanzas-api`, `finanzas-worker`, `analitica`, `n8n` y `mcp-server`; de 1 a 2 en `gateway`.

**No se suben:** Mailpit, Toxiproxy y OTel/Jaeger (D23: en la nube, logs con `correlationId`); el simulador de combustible, que corre desde la Mac contra `mq.albas.dev:8883`; la app del chofer, que se instala con Xcode (§6).

## 2. Quién habla con quién

| Desde | Hacia | Por | Autenticación |
|---|---|---|---|
| Las 4 apps del Centro de Control | Gateway `https://api.albas.dev/graphql` (HTTP y WebSocket) | HTTPS | Token con audiencia `gateway` |
| Portal | Viajes y Finanzas | HTTPS | Token del portal |
| Navegador y app | Keycloak | HTTPS | PKCE |
| App del chofer | Viajes, Flota, S3 (URL firmada) | HTTPS | Token de `app-chofer` |
| Gateway y MCP | Viajes y Flota por URL pública; Finanzas y Analítica por nombre interno (`http://finanzas-api`, `http://analitica`) | HTTPS / HTTP interno | Intercambio RFC 8693 |
| Analítica | MCP `http://mcp-server/mcp` | HTTP interno | Token del cliente `agente` |
| `flota-worker`, `finanzas-worker` | Temporal `mq.albas.dev:7233` | gRPC con mTLS | Certificado firmado por la CA propia |
| Viajes | Temporal y RabbitMQ | Red interna de la VM | Red de docker |
| Flota, Finanzas, Analítica, n8n | RabbitMQ `mq.albas.dev:5671` | AMQPS | Usuario por servicio y CA propia |
| Simulador (Mac) | RabbitMQ `mq.albas.dev:8883` | MQTTS | Usuario `sensor-sim` (D73) |
| Flota | Atlas | TLS | Usuario `flota-app` |
| Keycloak, Finanzas, n8n, Analítica | PostgreSQL de Azure `:5432` | TLS obligatorio | Un usuario por base |
| Viajes | DynamoDB, S3 | HTTPS | Rol de la EC2, sin claves |
| Viajes | Keycloak Admin API (alta de cliente) | HTTPS | Cuenta de servicio `viajes` con FGAP |
| n8n | `smtp-relay.brevo.com:587` | STARTTLS | Clave SMTP de Brevo |

## 3. Configuración de cada pieza

Solo lo que difiere del compose local. `<KC>` = `https://auth.albas.dev/realms/transporte`. `<PG>` = `psql-transporte-sw2bg-gp.postgres.database.azure.com`. `<FLOTA>` = la URL de Cloud Run. Los secretos viven en Parameter Store (`/transporte/env/*`, `/transporte/certs/*`), Secret Manager o los secretos de cada Container App, nunca en un workflow.

| Pieza | Variables |
|---|---|
| **viajes** | `OIDC_ISSUER=<KC>`, `AWS_REGION=us-east-2`, `S3_BUCKET=transporte-evidencias-albas`, `CORS_ORIGENES` con las 5 webs. Sin `AWS_ACCESS_KEY_ID`, `GPS_DYNAMODB_ENDPOINT` ni `S3_ENDPOINT` |
| **flota**, **flota-worker** | `OIDC_ISSUER=<KC>`, `MONGO_URI` y `AMQP_URL` (secretos), `AMQP_CA`, `CORS_ORIGENES`. El worker: `TEMPORAL_ADDRESS=mq.albas.dev:7233` y `TEMPORAL_TLS_CA/CERT/KEY` |
| **keycloak** | Comando `start`, `KC_HOSTNAME=https://auth.albas.dev`, `KC_PROXY_HEADERS=xforwarded`, `KC_HTTP_ENABLED=true`, `KC_HEALTH_ENABLED=true`, `KC_DB_URL=jdbc:postgresql://<PG>:5432/keycloak?sslmode=require`, `KC_DB_POOL_MAX_SIZE=7` |
| **finanzas-api**, **finanzas-worker** | `APP_ENV=production`, `OIDC_ISSUER=<KC>`, `DB_HOST=<PG>`, `AMQP_HOST=mq.albas.dev`, `AMQP_PORT=5671`, `TEMPORAL_ADDRESS=mq.albas.dev:7233`, `PORTAL_URL`, `CORS_ORIGENES`. El worker: `TEMPORAL_TLS_*` y comando `rr serve -c .rr.nube.yaml`. **Tras una versión con migraciones, correrlas a mano** (§7) |
| **gateway** | `OIDC_ISSUER=<KC>`, `VIAJES_URL=https://viajes.albas.dev`, `FLOTA_URL=<FLOTA>`, `FINANZAS_URL=http://finanzas-api`, `ANALITICA_URL=http://analitica`, `GATEWAY_URL=https://api.albas.dev`, `CORS_ORIGENES` con las 4 apps |
| **mcp-server** | Las mismas 4 URL y `OIDC_ISSUER` |
| **analitica** | `OIDC_ISSUER=<KC>`, `DATABASE_URL` y `AMQP_URL` (secretos; `amqps://…?cafile=/secretos/ca-pem`), `MCP_URL=http://mcp-server/mcp`, `LLM_BASE_URL=http://llm`, `LLM_TURNO_S=20`, `MISION_CADA_MINUTOS=0` (10 en la demo), `PORTAL_URL`, `CORS_ORIGENES` con las 4 apps |
| **n8n** | `DB_POSTGRESDB_HOST=<PG>`, `DB_POSTGRESDB_SSL_ENABLED=true`, `AMQP_HOST=mq.albas.dev`, `AMQP_PORT=5671`, `N8N_SMTP_HOST=smtp-relay.brevo.com`, `N8N_SMTP_PORT=587`, `N8N_SMTP_STARTTLS=true`, `GENERIC_TIMEZONE=America/La_Paz` |
| **4 apps del Centro de Control** | `configuracion.json`: `oidcIssuer=<KC>`, `gatewayUrl=https://api.albas.dev`, `jaegerUrl` vacío |
| **portal** | En el build: `VITE_OIDC_ISSUER=<KC>`, `VITE_VIAJES_URL`, `VITE_FINANZAS_URL`, `VITE_CENTRO_URL=https://tablero.albas.dev` |
| **app del chofer** | `APP_ENTORNO=nube`, `APP_VIAJES_URL`, `APP_FLOTA_URL=<FLOTA>`, `APP_OIDC_ISSUER=<KC>` |

## 4. DNS en name.com

| Host | Tipo | Valor |
|---|---|---|
| `viajes`, `mq` | A | `3.140.206.135` |
| `auth`, `finanzas`, `api`, `mcp` | CNAME | FQDN de `keycloak`, `finanzas-api`, `gateway` y `mcp-server` |
| `asuid.auth`, `asuid.finanzas`, `asuid.api`, `asuid.mcp` | TXT | Id de verificación del entorno |
| `portal`, `tablero`, `operaciones`, `flota-cc`, `finanzas-cc` | CNAME | `*.azurestaticapps.net` de cada web |
| Brevo | TXT y CNAME | `brevo-code`, DKIM `brevo1` y `brevo2`, DMARC `p=none` |

No agregues registros CAA: los certificados salen de Let's Encrypt (Caddy) y DigiCert (Azure), y un CAA incompleto rompe las renovaciones. El dominio raíz no tiene registro.

## 5. CI/CD

Un cambio entra por PR a `develop`, y `develop` pasa a `main` por PR. El push a `main` despliega solo las piezas cuya carpeta cambió. Ninguna nube guarda claves en GitHub: OIDC (AWS), Workload Identity Federation (GCP) y credencial federada (Azure). Cada `Environment` (`aws`, `gcp`, `azure`) tiene sus variables.

| Workflow | Se dispara con | Despliega en | Estado |
|---|---|---|---|
| `viajes` | `servicios/viajes/**` y sus contratos | ECR → SSM → compose en la EC2 | Automático |
| `plataforma-vm` | `plataforma/vm/**` y compose compartido | SSM → compose en la EC2 | Automático |
| `flota` | `servicios/flota/**` y sus contratos | Artifact Registry → `flota` y `flota-worker` | Automático |
| `finanzas` | `servicios/finanzas/**` y sus contratos | GHCR → `finanzas-api` y `finanzas-worker` | Automático |
| `analitica` | `servicios/analitica/**` y sus contratos | GHCR → `analitica` | Automático |
| `gateway`, `mcp-server` | Su carpeta, `libs/intercambio-token/**` y contratos | GHCR → Container App | Automático |
| `keycloak` | `plataforma/keycloak/**` | Job `keycloak-config` | Automático |
| `n8n` | `plataforma/n8n/**` | Job `n8n-importar` y reinicio de n8n | Automático |
| `llm` | Solo manual | GHCR → `llm` | Sin Container App (§8) |
| `web-cc-tablero`, `web-cc-operaciones`, `web-cc-flota`, `web-cc-finanzas`, `web-portal-cliente` | Su proyecto, `ui-comun`, tokens y contratos | Static Web Apps (`_deploy-web`), con modelos de IA | Automático |

Los workflows de `main` pasan. Con `workflow_dispatch` y `ensayo` una web se publica en un entorno de prueba, sin tocar producción. Cada paquete de GHCR necesita al repo con rol Write en *Manage Actions access*.

**Volver atrás:** desplegar el SHA anterior. Cloud Run y Container Apps guardan revisiones; en la EC2 es `docker compose up -d` con la etiqueta anterior.

## 6. Publicar lo que no tiene pipeline

**Webs, solo como respaldo si falla su workflow** (desde la Mac, con el token de `az staticwebapp secrets list -n <swa>`): compilar con la configuración de §3, escribir `staticwebapp.config.json` en la salida con `navigationFallback` a `index.html`, excluyendo `configuracion.json`, `salud.json`, `modelos/` y `tesseract/`, y una ruta que sirva `/salud.json` con `Access-Control-Allow-Origin: *` (sin ella la barra marca las otras apps «no disponible»), con los modelos bajados antes (`npm run modelos`), y publicar con `swa deploy <salida> --env production`.

**App del chofer en el iPhone** (`movil/app-chofer/ios`, con las variables de §3 en el entorno):

```bash
xcodebuild -workspace Chofer.xcworkspace -scheme Chofer -configuration Release -destination "id=<udid>" -derivedDataPath build -allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM=C3W2LB2ZA4 CODE_SIGN_STYLE=Automatic build
xcrun devicectl device install app --device <udid> build/Build/Products/Release-iphoneos/Chofer.app
```

`expo run:ios` no renueva el perfil de firma. Con cuenta gratuita de Apple el perfil dura 7 días.

## 7. Operación

| Tarea | Cómo |
|---|---|
| Encender o apagar todo | `plataforma/scripts/encender-demo.sh` y `apagar-demo.sh` (`SIMULAR=1` solo imprime) |
| Dejar la demo limpia | `plataforma/scripts/reiniciar-demo.sh --nube`, con `DOMINIO`, `KC_ADMIN`, `KC_ADMIN_CLAVE` y `N8N_DB_URL`. **Vacía todas las bases, incluido el historial** |
| Historial simulado | `plataforma/datos-sinteticos/cargar_historial.py`: 3 meses de viajes, facturas y cargas, y GPS de 30 días. Solo inserta. Las facturas son `FAC-1#####` |
| Probar de punta a punta | `plataforma/scripts/escenario-completo.sh --nube`, con `DOMINIO`, `FLOTA_URL` y `ANALITICA_URL`. Pide cada usuario por *device grant*: usa un perfil de navegador distinto por usuario, porque las ventanas de incógnito comparten sesión |
| Migraciones de Finanzas | `docker run` de la imagen con `php artisan migrate --force` desde la Mac |
| Túneles a Temporal UI y RabbitMQ | Session Manager, puertos 8233 y 15672 |
| Logs | CloudWatch `/transporte/vm`, Cloud Logging y Log Analytics. Se buscan por `correlationId` |
| Salud | `/health/ready` de cada servicio. El de Keycloak no sale por el ingress: usar su `.well-known/openid-configuration` |

**Antes de la demo:** despierta Flota con un `curl` a `/health/ready`. Si Cloud Run duerme, el Gateway la marca `DOWN` (plazo de 1,5 s) en la primera lectura.

**Usuarios de demostración** (D116): los de `plataforma/keycloak/usuarios-semilla.json`, todos con la misma clave, `KC_CLAVE_SEMILLA` de `.env.nube`.

**Después de la defensa:** detener PostgreSQL de Azure (lo más caro, ~0,18 USD/h), la EC2 y `flota-worker`; borrar la regla de firewall `mac`; pedir el reembolso del prepago de GCP antes de ~03/02/2027.

### Trampas conocidas

| Dónde | Trampa | Solución |
|---|---|---|
| Portal de Azure | «Express» crea otro entorno | Usar Standard y elegir `cae-transporte` |
| Portal de Azure | Deja marcada la imagen de inicio rápido, y sin `ghcr.io/` va a Docker Hub | Quitar la marca y escribir la referencia completa |
| Portal de Azure | Parte Command y Arguments por espacios y comas | No usar `sh -c` ahí |
| Portal de Azure | Pegar un PEM cambia los saltos de línea | `az containerapp secret set … "n=$(cat archivo)"` y reiniciar la revisión |
| Portal de Azure | El formulario de dominio no da certificado administrado | `az containerapp hostname add` y `bind` |
| Cuotas de GPU | No aparecen en «Mis cuotas» | Entorno → Cuota |
| n8n | Tras reimportar flujos no los toma | Reiniciar la revisión |
| AWS | La CLI lee Parameter Store en otra región | Pasar siempre `AWS_REGION=us-east-2` |
| AWS | `aws login` usa la cuenta abierta en el navegador | Debe ser la `816026730908` |
| GitHub OIDC | El sujeto del token trae ids (`repo:Alba-Tab@110486695/Sw2_SegundoParcial@1437938705:environment:<env>`) | AWS y Azure aceptan ese formato y el anterior |
| Keycloak | Desde 26.8.2 la Admin API rechaza con 401 los tokens sin `kc-admin-api` | El cliente `viajes` lleva ese scope. La imagen queda fijada en 26.8.2 |

## 8. Lo que falta

| Qué | Para qué | Cómo |
|---|---|---|
| **LLM** | Agente y redacción por voz | Pedir cuota T4 en el entorno, o plan C de D113: Ollama en la Mac con túnel autenticado y `LLM_BASE_URL` hacia él |
| FCM para Android (D45) | Push en Android | Pool WIF `aws`, cuenta `sa-fcm`, `create-cred-config` y `FCM_PROYECTO`. En iPhone no hace falta (D112) |
| Alarmas | Avisos de caídas | *Status check* de la EC2 y uptime checks. El presupuesto `transporte-100` de `rg-transporte` ya avisa a los 100 USD al mes |
