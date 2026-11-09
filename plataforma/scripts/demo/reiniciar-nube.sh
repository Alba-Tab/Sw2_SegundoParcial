#!/usr/bin/env bash
# reiniciar-demo.sh --nube (D102, T8.8): el mismo orden que en local, con los mecanismos de cada nube.
#   EC2 por SSM: Viajes (docker compose), rabbitmqctl purge_queue y temporal workflow terminate (cliente-admin).
#   Azure: Container Apps Jobs finanzas-demo y analitica-demo (misma imagen que la app, con su comando demo:reiniciar).
#   GCP: Cloud Run Job flota-demo (node dist/semilla.js --reiniciar).
#   Keycloak: la Admin API, como en local. n8n_inbox: psql a la B1MS con N8N_DB_URL.
# Variables: DOMINIO, KC_ADMIN, KC_ADMIN_CLAVE, N8N_DB_URL (postgresql://n8n:…@<B1MS>/n8n?sslmode=require).
# Con SIMULAR=1 solo imprime los comandos.
set -euo pipefail
AWS_REGION=${AWS_REGION:-us-east-2}
AZURE_RG=${AZURE_RG:-rg-transporte}
GCP_PROYECTO=${GCP_PROYECTO:-appchofer-transporte}
: "${DOMINIO:?}" "${KC_ADMIN:?}" "${KC_ADMIN_CLAVE:?}" "${N8N_DB_URL:?}"
# Consumidores y relays de Azure, con las réplicas a las que vuelven (las de encender-demo.sh).
CONSUMIDORES="finanzas-worker:1:1 analitica:1:1 n8n:1:1 finanzas-api:1:1"

c() { echo "+ $*" >&2; [ -n "${SIMULAR:-}" ] || "$@"; }
replicas() { c az containerapp update -g "$AZURE_RG" -n "$1" --min-replicas "$2" --max-replicas "$3" --output none; }
vm() { # vm <script>: corre el script en /opt/transporte/plataforma/vm de la EC2 por SSM y espera el resultado
  echo "+ ssm: $1" >&2
  [ -n "${SIMULAR:-}" ] && return
  local id cmd
  id=$(aws ec2 describe-instances --region "$AWS_REGION" --filters Name=tag:Name,Values=transporte-vm Name=instance-state-name,Values=running \
    --query 'Reservations[0].Instances[0].InstanceId' --output text)
  cmd=$(aws ssm send-command --region "$AWS_REGION" --instance-ids "$id" --document-name AWS-RunShellScript \
    --parameters "$(jq -nc --arg s "set -eu; cd /opt/transporte/plataforma/vm; $1" '{commands: [$s]}')" --query Command.CommandId --output text)
  aws ssm wait command-executed --region "$AWS_REGION" --command-id "$cmd" --instance-id "$id" || true
  aws ssm get-command-invocation --region "$AWS_REGION" --command-id "$cmd" --instance-id "$id" --query StandardOutputContent --output text
  [ "$(aws ssm get-command-invocation --region "$AWS_REGION" --command-id "$cmd" --instance-id "$id" --query Status --output text)" = Success ]
}
job() { # job <nombre>: corre un Container Apps Job y espera a que termine bien
  local ej estado
  ej=$(c az containerapp job start -g "$AZURE_RG" -n "$1" --query name -o tsv)
  [ -n "${SIMULAR:-}" ] && return
  for _ in $(seq 1 60); do
    estado=$(az containerapp job execution show -g "$AZURE_RG" -n "$1" --job-execution-name "$ej" --query properties.status -o tsv)
    case "$estado" in Succeeded) echo "   $1 terminó"; return ;; Failed|Stopped|Degraded) echo "$1: $estado" >&2; exit 1 ;; esac
    sleep 10
  done
  echo "$1 no terminó en 10 min" >&2; exit 1
}
DC="docker compose --env-file .env --env-file .env.imagen"

echo "1. Deteniendo relays y consumidores"
for a in $CONSUMIDORES; do IFS=: read -r app _ max <<<"$a"; replicas "$app" 0 "$max"; done
c gcloud run worker-pools update flota-worker --project "$GCP_PROYECTO" --region us-central1 --instances 0
vm "$DC stop viajes"

echo "2. Purgando colas y terminando workflows"
vm "$DC exec -T rabbitmq sh -c 'for q in \$(rabbitmqctl list_queues -q --no-table-headers name); do rabbitmqctl -q purge_queue \"\$q\"; done'
$DC run --rm --no-deps --entrypoint temporal temporal-namespace workflow terminate --namespace transporte --query \"ExecutionStatus='Running'\" --reason reiniciar-demo --yes || true"

echo "3. demo:reiniciar en cada servicio"
vm "$DC run --rm --no-deps viajes --semilla.cargar=reiniciar --server.port=0 --temporal.worker.habilitado=false | grep 'Semilla de Viajes'"
c gcloud run jobs execute flota-demo --project "$GCP_PROYECTO" --region us-central1 --wait
job finanzas-demo
job analitica-demo
c psql "$N8N_DB_URL" -qc "TRUNCATE n8n_inbox" && echo "   n8n_inbox vaciado"

echo "4. Clientes registrados en el portal"
KC="https://auth.$DOMINIO"
if [ -n "${SIMULAR:-}" ]; then echo "+ Admin API de $KC: borrar miembros de registro-portal" >&2
else . "$(dirname "$0")/keycloak-registros.sh"; fi

echo "5. Encendiendo relays y consumidores (el correo de Brevo no se vacía: no hay Mailpit en la nube)"
vm "$DC up -d viajes"
c gcloud run worker-pools update flota-worker --project "$GCP_PROYECTO" --region us-central1 --instances 1
for a in $CONSUMIDORES; do IFS=: read -r app min max <<<"$a"; replicas "$app" "$min" "$max"; done
echo "Demo reiniciada en la nube."
