#!/usr/bin/env bash
# Revisa que el entorno local esté sano (perfiles core y plataforma). Sale con 1 si algo falla.
set -uo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
DC="docker compose"
F=0
ok() { if [ "$2" = "$3" ]; then printf '  ok    %s\n' "$1"; else printf '  FALLA %s (esperado %s, obtenido %s)\n' "$1" "$3" "$2"; F=$((F+1)); fi; }
termino() { $DC ps -a --format '{{.Service}} {{.State}} {{.ExitCode}}' | awk -v s="$1" '$1==s{print $2"/"$3}'; }

echo "== Inicializaciones"
for s in aws-local-iniciar temporal-esquema temporal-namespace rabbitmq-usuarios keycloak-config keycloak-realm; do ok "$s" "$(termino $s)" "exited/0"; done
echo "== Bases"
ok "postgres-aws: viajes, temporal, temporal_visibility" "$($DC exec -T postgres-aws psql -U postgres -tAc "select string_agg(datname, ',' order by datname) from pg_database where datname in ('viajes','temporal','temporal_visibility')")" "temporal,temporal_visibility,viajes"
ok "postgres-azure: analitica, finanzas, keycloak, n8n" "$($DC exec -T postgres-azure psql -U postgres -tAc "select string_agg(datname, ',' order by datname) from pg_database where datname in ('finanzas','keycloak','n8n','analitica')")" "analitica,finanzas,keycloak,n8n"
ok "mongo rs0 PRIMARY" "$($DC exec -T mongo mongosh --quiet --eval 'rs.status().members[0].stateStr')" PRIMARY
ok "dynamodb: gps_puntos y sync_cursor" "$($DC run --rm -T --entrypoint aws -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_REGION aws-local-iniciar dynamodb list-tables --endpoint-url http://dynamodb-local:8000 --query 'join(`,`, TableNames)' --output text 2>/dev/null)" "gps_puntos,sync_cursor"
ok "s3 local: bucket $S3_BUCKET" "$($DC run --rm -T --entrypoint aws -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_REGION aws-local-iniciar s3api head-bucket --bucket "$S3_BUCKET" --endpoint-url http://s3-local:9000 >/dev/null 2>&1 && echo si)" si
echo "== Plataforma"
ok "temporal: namespace transporte (30 días)" "$($DC run --rm -T temporal-namespace "temporal operator namespace describe -n transporte | grep -o '720h0m0s'" 2>/dev/null)" 720h0m0s
R="curl -sf -u $RABBITMQ_ADMIN:$RABBITMQ_ADMIN_CLAVE http://localhost:15672/api"
ok "rabbitmq: 11 colas quorum" "$($R/queues | jq '[.[] | select(.type=="quorum")] | length')" 11
ok "rabbitmq: usuarios por servicio" "$($R/users | jq -r '[.[].name | select(. != "admin")] | sort | join(",")')" "analitica,finanzas,flota,n8n,sensor-sim,viajes"
ok "rabbitmq: plugin mqtt" "$($R/overview | jq -r '[.listeners[].protocol] | index("mqtt") != null')" true
ok "keycloak: emisor por $MAC_LOCAL" "$(curl -sf "http://localhost:8080/realms/transporte/.well-known/openid-configuration" | jq -r .issuer)" "http://$MAC_LOCAL:8080/realms/transporte"
ok "keycloak: login de gerente1 con id fijo" "$(curl -sf http://localhost:8080/realms/transporte/protocol/openid-connect/token -d grant_type=password -d client_id=demo-cli -d username=gerente1 --data-urlencode "password=$KC_CLAVE_SEMILLA" | jq -r '.access_token | split(".")[1] | gsub("-";"+") | gsub("_";"/") | @base64d | fromjson | .sub' 2>/dev/null)" 0193a000-0000-7000-8000-000000000001
ok "n8n responde" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5678/healthz)" 200
ok "mailpit responde" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8025/api/v1/info)" 200
ok "temporal ui responde" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8233/)" 200
echo "== Servicios"
for s in "viajes 8101" "flota-api 8102" "finanzas-api 8103"; do set -- $s
  if $DC ps --services --status running | grep -qx "$1"; then ok "$1: /health/ready" "$(curl -sf localhost:$2/health/ready | jq -r .estado)" UP; fi
done
echo; [ $F -eq 0 ] && echo "entorno OK" || { echo "$F verificaciones fallaron"; exit 1; }
