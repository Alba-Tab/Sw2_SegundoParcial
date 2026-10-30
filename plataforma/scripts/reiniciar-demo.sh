#!/usr/bin/env bash
# Reinicia la demo en el orden de D102 (T8.8). Uso: plataforma/scripts/reiniciar-demo.sh [--nube]
#   1. Detiene relays del Outbox y consumidores (los servicios y n8n).
#   2. Purga las colas y termina los workflows abiertos de Temporal.
#   3. Corre demo:reiniciar en Viajes, Flota, Finanzas y Analítica: cada uno vacía su base (Outbox e Inbox incluidos)
#      y carga plataforma/semilla directo, sin eventos (Analítica carga además los 3 meses sintéticos).
#   4. Borra en Keycloak a los clientes que se registraron en el portal (grupo registro-portal).
#   5. Enciende relays y consumidores.
# Todo son comandos (docker compose run/exec), nunca endpoints de los servicios.
set -euo pipefail
if [ "${1:-}" = "--nube" ]; then
  echo "La variante --nube (SSM en la EC2, Container Apps Jobs y Cloud Run Job) llega con el despliegue (F11)." >&2
  exit 2
fi
COMPOSE="$(cd "$(dirname "$0")/../compose" && pwd)"
set -a; . "$COMPOSE/.env"; set +a
dc() { docker compose -f "$COMPOSE/compose.yaml" --profile core --profile plataforma --profile ia "$@"; }
rabbit() { curl -sf -u "$RABBITMQ_ADMIN:$RABBITMQ_ADMIN_CLAVE" "$@"; }
SERVICIOS="viajes flota-api flota-worker finanzas-api finanzas-worker analitica n8n"

echo "1. Deteniendo relays y consumidores"
dc stop $SERVICIOS >/dev/null

echo "2. Purgando colas y terminando workflows"
for cola in $(rabbit http://localhost:15672/api/queues/%2F | python3 -c 'import json,sys; print(" ".join(q["name"] for q in json.load(sys.stdin)))'); do
  rabbit -X DELETE "http://localhost:15672/api/queues/%2F/$cola/contents" >/dev/null && echo "   $cola"
done
dc run --rm --no-deps --entrypoint temporal temporal-namespace workflow terminate --namespace transporte \
  --query "ExecutionStatus='Running'" --reason "reiniciar-demo" --yes >/dev/null 2>&1 || true
echo "   workflows abiertos terminados"

echo "3. demo:reiniciar en cada servicio"
dc run --rm --no-deps viajes --semilla.cargar=reiniciar --server.port=0 --temporal.worker.habilitado=false 2>&1 | grep -E "Semilla de Viajes" || { echo "Viajes falló" >&2; exit 1; }
dc run --rm --no-deps flota-worker node dist/semilla.js --reiniciar 2>&1 | grep -o "Semilla de Flota[^\"]*" || { echo "Flota falló" >&2; exit 1; }
dc run --rm --no-deps finanzas-api sh -c 'php artisan migrate --force >/dev/null && php artisan demo:reiniciar' | tail -2
dc run --rm --no-deps analitica sh -c 'alembic upgrade head && python -m app.demo reiniciar' | tail -1
dc exec -T postgres-azure psql -U n8n -d n8n -qc "TRUNCATE n8n_inbox" && echo "   n8n_inbox vaciado"

echo "4. Clientes registrados en el portal"
KC="${OIDC_ISSUER%/realms/*}"
ADMIN=$(curl -sf -X POST "$KC/realms/master/protocol/openid-connect/token" -d grant_type=password -d client_id=admin-cli \
  -d username="$KC_ADMIN" -d password="$KC_ADMIN_CLAVE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
GRUPO=$(curl -sf "$KC/admin/realms/transporte/groups?search=registro-portal&exact=true" -H "Authorization: Bearer $ADMIN" \
  | python3 -c 'import json,sys; g=json.load(sys.stdin); print(g[0]["id"] if g else "")')
if [ -n "$GRUPO" ]; then
  for u in $(curl -sf "$KC/admin/realms/transporte/groups/$GRUPO/members?max=500" -H "Authorization: Bearer $ADMIN" \
    | python3 -c 'import json,sys; print(" ".join(u["id"] for u in json.load(sys.stdin)))'); do
    curl -sf -X DELETE "$KC/admin/realms/transporte/users/$u" -H "Authorization: Bearer $ADMIN" && echo "   usuario $u borrado"
  done
fi

echo "5. Encendiendo relays y consumidores"
dc start $SERVICIOS >/dev/null
echo "Demo reiniciada: semilla de plataforma/semilla en todos los servicios, colas vacías y sin workflows abiertos."
