#!/usr/bin/env bash
# Apaga la nube fuera de las pruebas (guía §11), al revés que encender-demo.sh. Sigue costando: la IP elástica y el
# disco de la EC2 (unos 6 USD/mes). Azure vuelve a encender la B1MS sola a los 7 días.
# Uso: plataforma/scripts/apagar-demo.sh   (SIMULAR=1 solo imprime)
. "$(dirname "$0")/demo/nube.sh"

paso "Container Apps a 0 réplicas mínimas (sin tráfico, ninguna corre)"
for a in $APPS; do IFS=: read -r app _ max <<<"$a"; replicas "$app" 0 "$max"; done

paso "Worker de Flota a 0 instancias"
c gcloud run worker-pools update flota-worker --project "$GCP_PROYECTO" --region us-central1 --instances 0

paso "EC2 transporte-vm"
c aws ec2 stop-instances --region "$AWS_REGION" --instance-ids "$(vm)" --output text

paso "PostgreSQL B1MS"
c az postgres flexible-server stop -g "$AZURE_RG" -n "$PSQL_SERVIDOR"
