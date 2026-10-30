#!/usr/bin/env bash
# FS8 (local): corta o restaura el proxy de Toxiproxy hacia la base de Finanzas (puerto 25433, perfil demo).
# Uso: cortar-db-finanzas.sh off|on
set -euo pipefail
ESTADO=$([ "${1:-off}" = on ] && echo true || echo false)
curl -sf -X POST "http://localhost:8474/proxies/finanzas-db" -H 'Content-Type: application/json' -d "{\"enabled\": $ESTADO}" >/dev/null
echo "finanzas-db enabled=$ESTADO"
