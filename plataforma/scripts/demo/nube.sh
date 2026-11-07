# Ayudas de encender-demo.sh y apagar-demo.sh (guía §11). Se cargan con: . "$(dirname "$0")/demo/nube.sh"
# Con SIMULAR=1 solo imprime los comandos (sin credenciales ni recursos).
set -euo pipefail
AWS_REGION=${AWS_REGION:-us-east-1}
AZURE_RG=${AZURE_RG:-rg-transporte}
GCP_PROYECTO=${GCP_PROYECTO:-appchofer-transporte}
: "${PSQL_SERVIDOR:?falta PSQL_SERVIDOR (psql-transporte-<sufijo>)}"

# Container App, réplicas mínimas y máximas durante la demo (guía §7). n8n consume de RabbitMQ sin ingress: con 0
# réplicas no despierta por mensajes y los correos quedarían en la cola, así que va fijo en 1.
APPS="keycloak:1:1 finanzas-worker:1:1 analitica:1:1 n8n:1:1 mcp-server:0:1 llm:0:1 finanzas-api:0:2 gateway:0:2"

c() { echo "+ $*"; [ -n "${SIMULAR:-}" ] || "$@"; }
paso() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
vm() { # id de la EC2 transporte-vm
  [ -n "${SIMULAR:-}" ] && { echo i-simulada; return; }
  aws ec2 describe-instances --region "$AWS_REGION" --filters Name=tag:Name,Values=transporte-vm \
    Name=instance-state-name,Values=pending,running,stopping,stopped --query 'Reservations[0].Instances[0].InstanceId' --output text
}
replicas() { # replicas <app> <min> <max>; se pasan las dos porque --min-replicas solo a veces no se aplica
  c az containerapp update -g "$AZURE_RG" -n "$1" --min-replicas "$2" --max-replicas "$3" --output none
}
