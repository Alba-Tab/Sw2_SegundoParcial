# Plan de despliegue multinube

Estado: **aprobado** (28/10/2026; reparto cambiado por D113 el 04/11/2026). Parte de [plan-desarrollo.md](plan-desarrollo.md). Las tareas que lo ejecutan son F3b (esqueleto en AWS y GCP) y F11 (despliegue completo).

## Costos estimados (verificar en la calculadora de cada nube antes de crear recursos)

| Recurso | Estimación | Nota |
|---|---|---|
| EC2 t3.medium | ~0,042 USD/h (~30 USD/mes encendida siempre) | Se apaga fuera de los hitos |
| EBS gp3 30 GB | ~2,4 USD/mes | Se cobra aunque la VM esté apagada |
| IPv4 pública | ~3,6 USD/mes | Se cobra aunque la VM esté apagada |
| Egreso entre nubes | Variable | Bajo con el volumen de la demo |
| DynamoDB provisionado | 0 USD | Dentro de 25 WCU/RCU |
| flota-worker en Cloud Run | 0 USD dentro de la capa gratis (unas 66 h al mes con 1 vCPU) | Encendido solo en pruebas y demo (D113) |
| Container Apps con mínimo 1 (keycloak, finanzas-worker) y el resto en 0 (finanzas-api, analitica, n8n, gateway, mcp-server) | A calcular; la capa gratis de Container Apps cubre una parte | Se bajan con `apagar-demo.sh` |
| Azure PostgreSQL B1MS | 0 USD por 12 meses | — |
| GPU T4 en Container Apps | Por segundo, a calcular | Escala a cero |
| MongoDB Atlas M0 | 0 USD | — |
| Firebase Hosting y FCM (plan Spark) | 0 USD | Sin tarjeta |
| Cloud Run (Flota) | 0 USD dentro de la capa gratis | Prueba gratuita de GCP sin activar la cuenta completa (D113) |

## Despliegue

### 1 Calendario de cuentas

| Nube | Cuándo | Reglas |
|---|---|---|
| AWS | Inicio de F3b (jornada 10,25) | D41; Budgets desde el primer día; EC2 apagada fuera de los hitos |
| GCP | F3b | D113: prueba gratuita y capa gratis, **sin activar la cuenta completa**. Proyecto: el de Firebase, `appchofer-transporte`. Si la prueba de 90 días vence antes de la defensa, los recursos se detienen: anotar la fecha |
| Azure | Inicio de F11 (jornada 50,5), o inicio de F9 si quedan 30 días o menos hasta la defensa (T9.9) | Pago por uso el mismo día |

### 2 Qué va a cada nube

| Nube | Unidades |
|---|---|
| AWS | EC2: viajes, PostgreSQL de Viajes y Temporal, Temporal y su UI (por túnel), RabbitMQ (consola por túnel), Caddy. DynamoDB (20/5). S3 (POD) |
| GCP | Cloud Run: flota y flota-worker (este, solo en pruebas y demo). Atlas M0. Firebase Hosting con 5 sitios y FCM (plan Spark) |
| Azure | Container Apps: keycloak, finanzas, finanzas-worker, analitica, n8n (`maxReplicas = 1`), **gateway-erp y mcp-server** (D113). B1MS. LLM con GPU |

El orden y las tareas de F11 están en la tabla T11.1–T11.12.

### 3 CI/CD por unidad

Reutilizables: `_build-push-image`, `_deploy-ec2`, `_deploy-cloudrun`, `_deploy-containerapp`, `_deploy-firebase`, `_smoke`.

| Workflow | Se dispara con | En `main` |
|---|---|---|
| viajes | `servicios/viajes/**`, OpenAPI de viajes, eventos, temporal | ECR, SSM |
| plataforma-vm | `plataforma/vm/**` | SSM |
| flota | `servicios/flota/**`, OpenAPI de flota, eventos, temporal | Cloud Run (API y worker) |
| finanzas | `servicios/finanzas/**`, OpenAPI de finanzas, eventos, temporal | GHCR y Container Apps |
| analitica | `servicios/analitica/**`, `analitica.yaml`, eventos | GHCR y Container Apps (entrena el `.joblib` en el build) |
| gateway / mcp-server | Su carpeta, `libs/intercambio-token/**`, `contratos/graphql/**` u `openapi/**` | GHCR y Container Apps (D113) |
| keycloak | `plataforma/keycloak/**` | Imagen sin realm; dispara el Job `keycloak-config` (T11.3) |
| **n8n** | `plataforma/n8n/**` | Importación por la API de n8n (recortable en nivel 1: importación manual) |
| llm | `plataforma/llm/**` | Container Apps con GPU |
| cc-* (4) | `projects/<app>/**`, `projects/ui-comun/**`, `libs/design-tokens/**`, `contratos/graphql/**` | `firebase deploy --only hosting:<app>` |
| portal-cliente | `frontends/portal-cliente/**`, tokens de diseño, OpenAPI de viajes y finanzas | Firebase |
| app-chofer | `movil/app-chofer/**` | Sin despliegue |
| `ci.yml` (PR) | Todo | `ci-ok` y gitleaks |

### 4 Secretos

- **GitHub Environments** `aws`, `gcp` y `azure`, solo desde `main`: identificadores de OIDC, WIF y Azure. Ninguna clave guardada.
- **SSM:** certificados de la EC2, RabbitMQ, PostgreSQL y el secreto de `viajes`. FCM no usa clave: WIF de GCP con el rol de la EC2 (D45).
- **Build de la app:** `google-services.json` sale de un secreto en el build; no se versiona.
- **Secret Manager de GCP:** certificado de cliente de flota-worker, usuario de Atlas y RabbitMQ de Flota.
- **Secretos de Container Apps:** B1MS, administrador de Keycloak, **`KC_SECRETO_*` y `KC_CLAVE_*` del realm**, certificado de Temporal para Finanzas, n8n, SMTP, `analitica`, `agente`, `gateway`, `mcp-server` y `EXPORTACION_HMAC_SECRETO`.
- El realm y las imágenes públicas **solo llevan `$(env:...)`**, y gitleaks lo verifica.

---
