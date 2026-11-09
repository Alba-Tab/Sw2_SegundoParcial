# Plan de despliegue multinube

Por qué cada pieza está donde está y cuánto cuesta. Aprobado el 28/10/2026 y ajustado por D113, D114 y D115. El detalle de recursos y la operación están en [guia-despliegue.md](guia-despliegue.md). Las tareas son F3b y F11 de [plan-desarrollo.md](plan-desarrollo.md).

## Qué va a cada nube

Un microservicio de dominio por nube (requisito 1).

| Nube | Unidades | Motivo |
|---|---|---|
| AWS (`us-east-2`) | EC2 con Viajes, PostgreSQL, Temporal, RabbitMQ y Caddy; DynamoDB; S3 | Una sola VM concentra el núcleo de mensajería y orquestación. Ohio por la experiencia nueva de la cuenta (D115) |
| GCP (`us-central1`) | Flota (API y worker en Cloud Run), Atlas M0 y FCM | Sin pagar: prueba gratuita y capa gratis (D113) |
| Azure (`eastus`, `eastus2`) | Keycloak, Finanzas, Analítica, n8n, Gateway y MCP en Container Apps; PostgreSQL; las 5 webs en Static Web Apps; LLM cuando haya cuota | Mismo entorno para lo que se comunica por nombre interno (D113, D114) |

## Costos

| Recurso | Costo | Nota |
|---|---|---|
| EC2 `m7i-flex.large` | Por hora, con los créditos de AWS | Límite de gasto de 40 USD: al llegar, AWS pausa el proyecto |
| EBS 30 GB e IP elástica | ~6 USD/mes | Se cobran con la VM apagada |
| DynamoDB | 0 USD | Provisionado dentro de la capa gratis |
| Azure PostgreSQL `D2ds_v5` | ~0,18 USD/h | B1ms no estaba disponible en la región (D115). Es lo primero que se detiene |
| Container Apps | ~3 USD la primera semana | Réplicas fijas durante la demo |
| GPU T4 | Por segundo | Sin cuota todavía |
| Cloud Run y worker pool | Crédito de la prueba de GCP (vence ~03/02/2027) | El prepago de USD 30 se reembolsa a pedido |
| Atlas M0, Static Web Apps Free, FCM, Brevo | 0 USD | — |

## Secretos

- **GitHub Environments** `aws`, `gcp` y `azure`: solo identificadores de OIDC, WIF y Azure. Ninguna clave.
- **Parameter Store:** certificados de la EC2, RabbitMQ, PostgreSQL y el secreto de `viajes`.
- **Secret Manager:** URI de Atlas, RabbitMQ de Flota y certificado de cliente de `flota-worker`.
- **Secretos de Container Apps:** bases, Keycloak, certificado de Temporal, SMTP y clientes OIDC.
- **`.env.nube`** (ignorado por git): la copia local de todo lo anterior.
- El realm y las imágenes públicas solo llevan `$(env:...)`, y gitleaks lo verifica.
- La clave de los usuarios de semilla es única y sencilla, solo para la demostración (D116). Su valor tampoco va al repo.
