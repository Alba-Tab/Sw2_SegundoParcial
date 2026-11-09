#!/usr/bin/env bash
# Enciende la nube para pruebas o la demo (guía §11), en orden de dependencias: la B1MS (Keycloak, Finanzas, n8n y
# Analítica la necesitan), la EC2 (Temporal, RabbitMQ y Viajes), las Container Apps y el worker de Flota.
# Uso: plataforma/scripts/encender-demo.sh   (SIMULAR=1 solo imprime)
. "$(dirname "$0")/demo/nube.sh"

paso "PostgreSQL B1MS"
c az postgres flexible-server start -g "$AZURE_RG" -n "$PSQL_SERVIDOR"

paso "EC2 transporte-vm (docker compose arranca solo: restart unless-stopped)"
ID=$(vm)
c aws ec2 start-instances --region "$AWS_REGION" --instance-ids "$ID" --output text
c aws ec2 wait instance-running --region "$AWS_REGION" --instance-ids "$ID"

paso "Container Apps"
for a in $APPS; do IFS=: read -r app min max <<<"$a"; replicas "$app" "$min" "$max"; done

paso "Worker de Flota (Cloud Run worker pool)"
c gcloud run worker-pools update flota-worker --project "$GCP_PROYECTO" --region us-central1 --instances 1

echo; echo "Listo. Revisa la salud con los smoke de cada pieza (guía §10) antes de la demo."
