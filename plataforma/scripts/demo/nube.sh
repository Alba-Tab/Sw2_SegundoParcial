# Ayudas de encender-demo.sh y apagar-demo.sh (guía §11). Se cargan con: . "$(dirname "$0")/demo/nube.sh"
# Con SIMULAR=1 solo imprime los comandos (sin credenciales ni recursos).
set -euo pipefail
AWS_REGION=${AWS_REGION:-us-east-2}
AZURE_RG=${AZURE_RG:-rg-transporte}
GCP_PROYECTO=${GCP_PROYECTO:-appchofer-transporte}
PSQL_SERVIDOR=${PSQL_SERVIDOR:-psql-transporte-sw2bg-gp}

# Container App, réplicas mínimas y máximas durante la demo (guía §7). n8n consume de RabbitMQ sin ingress: con 0
# réplicas no despierta por mensajes y los correos quedarían en la cola, así que va fijo en 1. Mínimo 1 en las APIs: sin arranque en frío en la demo.
# shortcut: sin `llm` porque Azure no dio cuota de GPU; agregar llm:0:1 cuando exista la Container App.
APPS="keycloak:1:1 finanzas-worker:1:1 analitica:1:1 n8n:1:1 mcp-server:1:1 finanzas-api:1:1 gateway:1:2"

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
