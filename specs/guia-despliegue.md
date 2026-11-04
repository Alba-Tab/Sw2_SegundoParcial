# Guía de despliegue paso a paso (F3b, F11)

Complementa a [plan-despliegue.md](plan-despliegue.md) (qué va a cada nube y por qué) con el **cómo**: cuentas, recursos, dominio, CI/CD y monitoreo. Las tareas son las T3b.x y T11.x de [plan-desarrollo.md](plan-desarrollo.md). Donde esta guía dice `<dominio>` va el dominio de name.com (por ejemplo `midominio.com`).

**Regla de oro:** nada se despliega a mano después de la primera vez. Un cambio entra por PR a `develop`, `develop` pasa a `main` por PR, y el push a `main` despliega **solo las piezas cuya carpeta cambió**. Las nubes nunca ven una clave guardada en GitHub: se entra con OIDC (AWS), Workload Identity Federation (GCP) y credencial federada (Azure).

## 0. Mapa final

| Pieza | Nube | Servicio | Nombre del recurso | URL pública |
|---|---|---|---|---|
| Viajes | AWS `us-east-1` | EC2 t3.medium + docker compose | `transporte-vm` | `https://viajes.<dominio>` (Caddy, Let's Encrypt) |
| PostgreSQL de Viajes y Temporal | AWS | contenedor en la EC2 | — | ninguna |
| Temporal + UI | AWS | contenedor en la EC2 | — | `mq.<dominio>:7233` con mTLS; la UI solo por túnel SSM |
| RabbitMQ (AMQP + MQTT) | AWS | contenedor en la EC2 | — | `mq.<dominio>:5671` (AMQPS) y `:8883` (MQTTS); la consola solo por túnel |
| GPS y cursores | AWS | DynamoDB provisionado | `gps_puntos`, `sync_cursor` | — |
| Evidencias (fotos, firmas) | AWS | S3 | `transporte-evidencias-<sufijo>` | URLs firmadas |
| Flota API | GCP `us-central1` | Cloud Run | `flota` | `https://flota.<dominio>` o la `*.run.app` |
| Flota worker | GCP | Cloud Run worker pool | `flota-worker` | ninguna |
| MongoDB | MongoDB Atlas M0 (en GCP `us-central1`) | clúster compartido | `transporte` | ninguna |
| Gateway GraphQL | GCP | Cloud Run | `gateway` | `https://api.<dominio>` |
| Servidor MCP | GCP | Cloud Run, `maxInstances = 1` | `mcp-server` | `https://mcp.<dominio>` |
| 4 apps del Centro de Control + portal | GCP | Firebase Hosting, 5 sitios | `transporte-tablero`, `-operaciones`, `-flota`, `-finanzas`, `-portal` | `tablero.`, `operaciones.`, `flota-cc.`, `finanzas-cc.`, `portal.<dominio>` |
| Push al chofer | GCP | Firebase Cloud Messaging | mismo proyecto | — |
| Keycloak | Azure | Container Apps + Job `keycloak-config` | `keycloak` | `https://auth.<dominio>` |
| Finanzas API | Azure | Container Apps | `finanzas-api` | `https://finanzas.<dominio>` (el portal la llama) |
| Finanzas worker | Azure | Container Apps, sin ingress, 1 réplica | `finanzas-worker` | ninguna |
| Analítica | Azure | Container Apps, `maxReplicas = 1` | `analitica` | la `*.azurecontainerapps.io` (solo la llaman Gateway y MCP) |
| n8n | Azure | Container Apps, `maxReplicas = 1`, IP restringida | `n8n` | la `*.azurecontainerapps.io` |
| PostgreSQL de Finanzas, Keycloak, n8n y Analítica | Azure | PostgreSQL Flexible B1MS | `psql-transporte-<sufijo>` | ninguna (firewall) |
| LLM (Ollama + qwen3:4b-instruct) | Azure | Container Apps con GPU T4, **ingress interno** | `llm` | ninguna: solo dentro del entorno |
| Correo | Brevo (D37) | SMTP | — | remitente `avisos@<dominio>` |
| App del chofer | — | build local con Xcode (`APP_ENTORNO=nube`) | — | — |

No se suben: Mailpit, Toxiproxy, OTel/Jaeger (D23: en la nube, logs con `correlationId`) y el simulador de combustible (corre desde la Mac contra `mq.<dominio>`).

**Por qué el dominio sobre todo en `auth.`:** el emisor `https://auth.<dominio>/realms/transporte` queda dentro de cada token y de la app del chofer. Cambiarlo después obliga a reconstruir todo; se fija desde el primer día. Las APIs que solo llaman otros servicios pueden quedarse con su URL por defecto (ya es HTTPS).

## 1. Seguridad de las cuentas (antes de crear nada, ~45 min)

| Dónde | Qué hacer |
|---|---|
| AWS | MFA en el usuario raíz y no volver a usarlo. Crear un usuario administrador en IAM Identity Center con MFA. Budgets en 10, 25 y 50 USD (D41) con aviso por correo. Activar Cost Explorer |
| GCP | Proyecto nuevo `transporte-carga-<sufijo>` solo para esto (es el «grupo» de GCP). Cuenta de pago (D42). Presupuesto en el proyecto con alertas al 50, 90 y 100 %. 2FA en la cuenta de Google |
| Azure | MFA en la cuenta. Una sola suscripción de pago por uso. Grupo de recursos `rg-transporte` (todo vive ahí) y presupuesto **sobre ese grupo** con alertas |
| name.com | 2FA, bloqueo de transferencia del dominio (Domain Lock) y renovación automática |
| GitHub | 2FA; en `main`, protección: PR obligatorio y check `ci-ok` (igual que `develop`) |
| Etiquetas | En las tres nubes, todo recurso lleva `proyecto=transporte` y `entorno=demo`. Así se filtran costos y recursos |

**Primer día, sin falta:** pedir la cuota de GPU T4 de Container Apps (sección 4.1). Tarda de 1 a 2 días hábiles y es lo único que no depende de ti.

## 2. AWS: base de Viajes (T3b.1, T3b.2)

**Grupo:** en la consola, *myApplications* → crear la aplicación `transporte` y asociarle los recursos por la etiqueta `proyecto=transporte`. Muestra costo, alarmas y recursos en una sola pantalla.

| Recurso | Configuración |
|---|---|
| ECR | Repositorio privado `transporte/viajes`, escaneo al subir y regla de ciclo de vida «conservar las 10 últimas» |
| S3 | `transporte-evidencias-<sufijo>`: Block Public Access completo, cifrado SSE-S3, política que niega todo lo que no sea TLS, la regla de D67 y CORS solo para los orígenes de Firebase (GET y PUT firmados) |
| DynamoDB | `gps_puntos` (PK `viajeId`, SK `tsSeq`, TTL `expiraEn`) y `sync_cursor` (PK `dispositivoId`, SK `viajeId`), en modo provisionado dentro de la capa gratuita (spec 005, D55) |
| Parameter Store | `SecureString` bajo `/transporte/`: claves de PostgreSQL, RabbitMQ, el secreto del cliente `viajes` de Keycloak y los certificados de la CA propia. **Valores nuevos y fuertes, nunca los de `.env.example`** |
| Rol de la EC2 `transporte-vm-role` | `AmazonSSMManagedInstanceCore` + una política propia: leer de ECR, leer y escribir solo esas 2 tablas y ese bucket, `ssm:GetParameters*` solo en `/transporte/*` y escribir en CloudWatch Logs |
| Grupo de seguridad `transporte-vm-sg` | Entrada: 443 y 80 (Caddy), 5671 (AMQPS), 8883 (MQTTS) y 7233 (Temporal con mTLS). **El 22 cerrado**: se entra con SSM Session Manager |
| EC2 `transporte-vm` | t3.medium, Amazon Linux 2023 (trae el agente de SSM), EBS gp3 30 GB cifrado, **IMDSv2 obligatorio**, el rol de arriba, Docker y el plugin de compose |
| IP elástica | Asociada a la EC2 (D32) |
| CloudWatch | Driver `awslogs` en el compose (grupo `/transporte/vm`, retención 14 días) y alarma de *status check* de la EC2 |

En la EC2 corre `plataforma/vm/compose.yaml` (**hay que escribirlo**, T3b.1): Caddy, Viajes, PostgreSQL, Temporal con mTLS, Temporal UI y RabbitMQ con AMQPS y MQTTS. Caddy solo publica Viajes. Temporal y RabbitMQ usan la CA propia: Flota, Finanzas y el simulador confían en ella; cada servicio tiene su certificado de cliente para Temporal.

**CI/CD de AWS:**
1. Proveedor OIDC de IAM `token.actions.githubusercontent.com` con audiencia `sts.amazonaws.com`.
2. Rol `transporte-gha-deploy` cuya relación de confianza **solo** acepta `sub = repo:Alba-Tab/Sw2_SegundoParcial:environment:aws`. Permisos: subir a `transporte/viajes` en ECR y `ssm:SendCommand` solo a instancias con `proyecto=transporte`.
3. El workflow `viajes.yml`: construye, sube a ECR con la etiqueta del commit (`${{ github.sha }}`, nunca `latest`), manda por SSM `docker compose pull viajes && docker compose up -d viajes` y hace el *smoke* `https://viajes.<dominio>/health/ready`.

## 3. GCP: Flota, Gateway, MCP y las 5 webs (T3b.3, T3b.4, T11.8, T11.9)

**Grupo:** el proyecto `transporte-carga-<sufijo>` entero.

1. Habilitar las APIs: Cloud Run, Artifact Registry, Secret Manager, IAM Credentials, Security Token Service, Firebase Hosting, Cloud Monitoring y FCM.
2. **Artifact Registry:** repositorio Docker `transporte` en `us-central1`.
3. **Cuentas de servicio de ejecución** (una por servicio, sin roles de más): `sa-flota`, `sa-gateway`, `sa-mcp`. Cada una solo lee sus secretos.
4. **Secret Manager:** URI de Atlas, usuario de RabbitMQ de Flota, certificado de cliente de Temporal de flota-worker, secretos de los clientes `gateway` y `mcp-server` de Keycloak y `EXPORTACION_HMAC_SECRETO`.
5. **MongoDB Atlas M0** en GCP `us-central1`: clúster `transporte`, base `flota`, usuario `flota-app` con contraseña fuerte y solo `readWrite` sobre `flota`. Lista de acceso `0.0.0.0/0`, porque Cloud Run no tiene IP fija; lo compensan TLS y el usuario fuerte (T3b.3).
6. **Cloud Run:**

   | Servicio | Ajustes |
   |---|---|
   | `flota` | Mínimo 0, máximo 2 |
   | `flota-worker` (worker pool) | 1 instancia durante la demo y 0 fuera de ella |
   | `gateway` | Mínimo 0, máximo 2 |
   | `mcp-server` | **Máximo 1** (D89) |

   Las variables salen del compose (`OIDC_ISSUER`, `*_URL`, `CORS_ORIGENES`), con las URLs de la nube.
7. **Firebase:** agregar Firebase al mismo proyecto y crear 5 sitios de Hosting. Cada app del Centro de Control lee `configuracion.json` al arrancar: el workflow escribe la versión de la nube (`oidcIssuer`, `gatewayUrl` y las 5 URLs) antes del `firebase deploy`. El portal necesita `VITE_OIDC_ISSUER`, `VITE_VIAJES_URL`, `VITE_FINANZAS_URL` y `VITE_CENTRO_URL` **en el build** (pendiente T3b.4).
8. **FCM (D45):** el `google-services.json` de la app sale de este proyecto (secreto del build, no se versiona). Viajes, desde la EC2, envía con Workload Identity Federation de proveedor AWS y una cuenta `sa-fcm` con el rol de FCM, sin clave guardada.
9. **CI/CD de GCP:**
   - Pool de Workload Identity `github` con un proveedor OIDC para `https://token.actions.githubusercontent.com`.
   - Condición del proveedor: `assertion.repository == 'Alba-Tab/Sw2_SegundoParcial' && assertion.environment == 'gcp'`.
   - Cuenta `gha-deploy` con `artifactregistry.writer`, `run.developer`, `iam.serviceAccountUser` (solo sobre las 3 cuentas de ejecución) y `firebasehosting.admin`.
   - Los workflows `flota.yml`, `gateway.yml`, `mcp-server.yml` y los 5 de Firebase entran con `google-github-actions/auth`.

**Dominios en GCP:**
- Webs: Firebase Hosting → *Add custom domain*. Firebase da los registros (TXT de verificación y A o CNAME) y emite el certificado solo.
- APIs: mapeo de dominio de Cloud Run (`gcloud beta run domain-mappings create --service gateway --domain api.<dominio> --region us-central1`). Pide verificar el dominio en Search Console y da un `CNAME` a `ghs.googlehosted.com`. **Ojo:** sigue en *preview*, con regiones limitadas y latencia alta desde algunos lugares. Si falla en `us-central1`, se usa la URL `*.run.app`: un balanceador global cuesta unos 18 USD al mes y no vale la pena para la demo. Firebase Hosting con *rewrite* a Cloud Run no sirve para el Gateway, porque no pasa WebSockets (la suscripción de alertas).

## 4. Azure: Keycloak, Finanzas, Analítica, n8n y el LLM (T11.1 a T11.7)

**Grupo:** `rg-transporte`, todo en una región que tenga T4 (East US figura en la lista; confirmar en la tabla oficial antes de crear). Un solo Log Analytics y un solo entorno de Container Apps: los logs de todo quedan en un solo lugar.

### 4.1 Cuota de GPU (primer día)

Portal → *Help + support* → solicitud de cuota de Container Apps «Managed Environment Consumption T4 Gpus» en la región elegida. Es una solicitud manual por caso de soporte y tarda de 1 a 2 días hábiles.

**Si la niegan:**
- **Plan B:** Cloud Run con L4 en GCP (D36). Necesita autenticación por IAM: el LLM no puede quedar expuesto sin autenticar.
- **Plan C:** Ollama en la Mac con un túnel autenticado, solo durante la defensa.

### 4.2 Recursos

| Recurso | Configuración |
|---|---|
| Log Analytics | `log-transporte`, retención 30 días |
| PostgreSQL Flexible | `psql-transporte-<sufijo>`, Burstable **B1MS**, PostgreSQL 17, 32 GB, TLS obligatorio. Acceso público solo con la regla «Allow Azure services» (más la IP de la Mac mientras configuras). Bases y usuarios: `finanzas`, `keycloak`, `n8n` y `analitica`, uno por base. Pools: Keycloak 7, n8n 5, Finanzas 8 y Analítica 5 (plan-despliegue). Se puede detener fuera de la demo |
| Identidad `id-gha-transporte` | Identidad administrada con una credencial federada: emisor `https://token.actions.githubusercontent.com`, sujeto `repo:Alba-Tab/Sw2_SegundoParcial:environment:azure`. Rol **Contributor solo sobre `rg-transporte`**, nunca sobre la suscripción |
| Entorno de Container Apps | `cae-transporte`, con *workload profiles*: Consumption para todo y `gpu-t4` (`Consumption-GPU-NC8as-T4`) solo para el LLM |
| Imágenes | GHCR del repo (plan-despliegue). El repo es público y las imágenes no llevan secretos: lo verifica gitleaks y el realm solo trae `$(env:...)`. Si se prefieren privadas: Azure Container Registry Basic (~5 USD/mes) |

### 4.3 Container Apps

| App | Ingress | Réplicas | Notas |
|---|---|---|---|
| `keycloak` | Externo, `auth.<dominio>` | 1 durante la demo | `KC_HOSTNAME=https://auth.<dominio>`, proxy por `X-Forwarded-*` (el TLS termina en el ingress), base en B1MS con pool de 7, `KC_SSL_REQUIRED=external`, `KC_DEMO_CLI_DIRECT_GRANT=false` (D39) |
| Job `keycloak-config` | — | manual | Imagen con keycloak-config-cli, `curl` y `jq`. Corre los dos pasos de `aplicar-realm.sh` con los `KC_SECRETO_*` y `KC_CLAVE_*` de los secretos de Container Apps y `KC_URL_CC_*` y `KC_URL_PORTAL` con los dominios de Firebase (T11.3) |
| `finanzas-api` | Externo, `finanzas.<dominio>` | 0 a 1 | Octane |
| `finanzas-worker` | Sin ingress | **1** fijo | RoadRunner con Temporal (mTLS hacia `mq.<dominio>:7233`), `eventos:consumir` y `outbox:publicar` |
| `analitica` | Externo | máximo **1** | `LLM_BASE_URL=http://llm` (red interna del entorno); `MISION_CADA_MINUTOS` (ver sección 8) |
| `n8n` | Externo con **restricción de IP** (solo tu IP) | máximo **1** | SMTP de Brevo; el importador de flujos corre como Job |
| `llm` | **Interno** (solo dentro del entorno) | 0 a 1, perfil `gpu-t4` | Imagen propia de Ollama con `qwen3:4b-instruct` ya descargado (unos 2,5 GB) y la versión con el parche del CVE-2026-7482 |

Los secretos van en los secretos de cada Container App: B1MS, administrador de Keycloak, `KC_*`, certificado de Temporal de Finanzas, n8n, SMTP, `analitica` y `agente`. Nada pasa por GitHub.

**Dominio en Azure:** Container App → *Custom domains* → agregar `auth.<dominio>` con certificado administrado (gratis). Pide un `CNAME` al FQDN de la app y un `TXT` `asuid.auth` con el id de verificación del entorno.

**CI/CD de Azure:** `azure/login` con `client-id`, `tenant-id` y `subscription-id` (sin secreto) y `az containerapp update --image ghcr.io/alba-tab/<pieza>:${{ github.sha }}`. Workflows `finanzas.yml` (API y worker), `analitica.yml` (entrena el `.joblib` en el build), `keycloak.yml` (imagen y luego `az containerapp job start`) y `n8n.yml`.

## 5. DNS en name.com

Domain → *Manage DNS Records*. Mientras configuras, TTL de 300 s. Solo subdominios: el registro raíz se puede redirigir a `portal.` con *URL Forwarding* de name.com.

| Host | Tipo | Valor | Para |
|---|---|---|---|
| `viajes` | A | IP elástica | Caddy emite el certificado de Let's Encrypt solo |
| `mq` | A | IP elástica | Temporal, AMQPS y MQTTS (CA propia) |
| `auth` | CNAME | FQDN de `keycloak` en Container Apps | Keycloak |
| `asuid.auth` | TXT | id de verificación del entorno | validación de Azure |
| `finanzas` | CNAME | FQDN de `finanzas-api` | portal |
| `asuid.finanzas` | TXT | id de verificación | validación de Azure |
| `api`, `mcp`, `flota` | CNAME | `ghs.googlehosted.com` | mapeo de Cloud Run (si funciona en `us-central1`) |
| `portal`, `tablero`, `operaciones`, `flota-cc`, `finanzas-cc` | lo que indique Firebase | — | las 5 webs |
| `@` | TXT | `google-site-verification=…` | Search Console (para el mapeo de Cloud Run) |
| Brevo | TXT y CNAME | SPF, DKIM y `_dmarc` (`v=DMARC1; p=none; rua=mailto:<tu correo>`) | que los correos de n8n no caigan en spam |

No agregues registros CAA: los certificados salen de tres emisores distintos (Let's Encrypt, Google y DigiCert para Azure) y un CAA incompleto rompe las renovaciones.

## 6. GitHub: despliegue automático

1. **Environments** `aws`, `gcp` y `azure` (Settings → Environments), cada uno con *Deployment branches: Selected → `main`*. Opcional: *Required reviewers* contigo, para aprobar cada despliegue con un clic.
2. **Variables** del environment (no son secretas, pero no hace falta que estén en el código):

   | Environment | Variables |
   |---|---|
   | `aws` | `AWS_ROLE_ARN`, `AWS_REGION` |
   | `gcp` | `GCP_PROYECTO`, `GCP_WIF_PROVIDER`, `GCP_SA` |
   | `azure` | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` |

3. **Workflows** (plan-despliegue §3; **hay que escribirlos**):
   - Reutilizables: `_build-push-image`, `_deploy-ec2`, `_deploy-cloudrun`, `_deploy-containerapp`, `_deploy-firebase` y `_smoke`.
   - Uno por pieza, con `on: push: branches: [main]` y `paths:` de su carpeta, sus contratos y `libs/` cuando aplica.
   - Permisos mínimos: `id-token: write` y `contents: read`.
   - Cada despliegue termina con un *smoke* a `/health/ready`; si falla, el job queda rojo.
4. **Volver atrás:** volver a desplegar el SHA anterior. Cloud Run y Container Apps guardan revisiones (se puede devolver el tráfico desde la consola); en la EC2 es `docker compose up -d` con la etiqueta anterior.

Esqueleto de uno, para ver la idea:

```yaml
name: analitica
on:
  push:
    branches: [main]
    paths: ['servicios/analitica/**', 'contratos/openapi/analitica.yaml', 'contratos/eventos/**']
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
        with: { context: ., file: servicios/analitica/Dockerfile, push: true, tags: 'ghcr.io/alba-tab/analitica:${{ github.sha }}' }
      - uses: azure/login@v2
        with: { client-id: '${{ vars.AZURE_CLIENT_ID }}', tenant-id: '${{ vars.AZURE_TENANT_ID }}', subscription-id: '${{ vars.AZURE_SUBSCRIPTION_ID }}' }
      - run: az containerapp update -g rg-transporte -n analitica --image ghcr.io/alba-tab/analitica:${{ github.sha }}
      - run: curl -fsS --retry 10 --retry-delay 6 https://$(az containerapp show -g rg-transporte -n analitica --query properties.configuration.ingress.fqdn -o tsv)/health/ready
```

## 7. Orden de la primera puesta en marcha

Cada paso tiene su «hecho cuando» en la tabla T11 del plan.

1. Cuentas, presupuestos, cuota de GPU y name.com (sección 1).
2. AWS: EC2 con el compose de la VM, DNS de `viajes` y `mq`, y que Temporal acepte mTLS desde la Mac (T3b.1).
3. Azure: B1MS, Keycloak con `auth.<dominio>`, y el Job `keycloak-config` hasta que entre un usuario por rol (T11.2, T11.3).
4. Viajes por su pipeline, con `OIDC_ISSUER` apuntando a `auth.` (T3b.2).
5. GCP: Atlas, Flota y su worker pool, y la Temporal UI por túnel mostrando el worker de `flota` (T3b.3, T3b.4).
6. Azure: Finanzas API y worker (el worker aparece en la cola `finanzas`), Analítica, n8n (llega un correo real) y el LLM (responde en menos de 10 s ya despierto) (T11.4 a T11.7).
7. GCP: Gateway y MCP, y el Inspector contra la nube (T11.8).
8. Firebase: las 5 webs, `CORS_ORIGENES`, Web Origins del realm y el salto de SSO entre apps (T11.9).
9. Túneles SSM para la Temporal UI y la consola de RabbitMQ (T11.10).
10. Semilla en la nube y `reiniciar-demo.sh --nube` (T11.11).
11. `escenario-completo.sh --nube` en verde y `pg_stat_activity` con 35 conexiones o menos, también durante un redespliegue (T11.12).

## 8. Monitoreo y costos

| Qué | Dónde |
|---|---|
| Vista de cada nube | AWS *myApplications* `transporte`; GCP el proyecto; Azure el grupo `rg-transporte` (*Cost analysis* y *Insights*) |
| Salud de todo en un solo lugar | **Uptime checks de Cloud Monitoring** (GCP, gratis hasta cierto volumen) contra el `/health/ready` público de cada pieza de las tres nubes y la portada de cada web, con alerta por correo |
| Logs | CloudWatch (`/transporte/vm`), Cloud Logging (Cloud Run) y Log Analytics (Container Apps). Se buscan por `correlationId` (D23) |
| Alertas | Reinicios de réplicas y 5xx en Container Apps; *status check* de la EC2; errores de Cloud Run |
| Presupuestos | Uno por nube (sección 1) |

**Lo que más cuesta y cómo se apaga** (`encender-demo.sh` y `apagar-demo.sh`, T3b.5, **hay que escribirlos**):
- Detener la EC2. La IP elástica y el disco igual se cobran, unos 6 USD/mes.
- Worker pool de Flota en 0.
- Container Apps en 0 réplicas (incluido `finanzas-worker`).
- B1MS detenida (Azure la vuelve a encender sola a los 7 días).
- **El LLM:** escala a cero, pero la misión del agente cada 10 min lo mantiene despierto. Fuera de la ventana de demo, poner `MISION_CADA_MINUTOS=0` en `analitica` (o 30 o más) y dispararla a mano.

## 9. LLM, agentes de Google y Claude

- **El agente sigue con LLM propio** (D36). La propuesta lo exige: «LLM propio: ningún dato va a proveedores de IA de terceros» (sección de tecnologías y requisito 10). Gemini o un agente de Vertex AI cambiaría la propuesta y D36; no se hace sin decisión del equipo.
- **Conectar el MCP a Claude:** el servidor no publica los metadatos de recurso protegido de OAuth (`/.well-known/oauth-protected-resource`) que pide un conector remoto, y solo acepta el `azp` del cliente `agente`. Haría falta código en mcp-server, un cliente nuevo en el realm y una decisión, porque los datos irían a un tercero. Para la defensa, el MCP Inspector ya demuestra la interoperabilidad (FM1).

## 10. Qué hay que escribir en el repo

| Qué | Tarea | Rama |
|---|---|---|
| `plataforma/vm/compose.yaml`, `Caddyfile` y la CA propia | T3b.1 | `feat/plataforma/vm-aws` |
| `plataforma/aws/crear-recursos.sh` (o los pasos de la sección 2 en la consola) | T3b.1 | `feat/plataforma/vm-aws` |
| `configuracion.json` de nube de las 4 apps y `VITE_*` del portal | T3b.4, T11.9 | `ci/ci/deploy-firebase` |
| Workflows reutilizables y uno por pieza | T3b.2, T3b.4, T11.3 a T11.9 | `ci/ci/deploy-*` |
| Imagen del Job `keycloak-config` | T11.3 | `feat/plataforma/keycloak-nube` |
| Imagen del LLM (`plataforma/llm/`) | T11.7 | `feat/plataforma/llm-gpu` |
| `encender-demo.sh` y `apagar-demo.sh` | T3b.5 | `feat/plataforma/scripts-encender-apagar` |
| Variante `--nube` de `reiniciar-demo.sh` y de `escenario-completo.sh` | T11.11, T11.12 | `chore/plataforma/config-nube` |
