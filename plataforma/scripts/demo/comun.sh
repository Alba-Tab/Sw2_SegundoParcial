# Ayudas de los scripts de demo (local). Se cargan con: . "$(dirname "$0")/comun.sh"
# Tokens con direct grant de demo-cli (D39, solo local) y la clave de la semilla de plataforma/compose/.env.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE="$RAIZ/plataforma/compose"
set -a; . "$COMPOSE/.env"; set +a
VIAJES="${VIAJES_URL:-http://localhost:8101}"
FINANZAS="${FINANZAS_URL:-http://localhost:8103}"

# Ids de plataforma/semilla.
COCHABAMBA=01933a00-0000-7000-8000-000000000001
LA_PAZ=01933a00-0000-7000-8000-000000000002
ARICA=01933a00-0000-7000-8000-000000000003
AULA=01933a00-0000-7000-8000-000000000004
AGROEXPORT=0193a000-0000-7000-8000-0000000c0001
AGRO_MOROSO=0193a000-0000-7000-8000-0000000c0002
FERRETERIA=0193a000-0000-7000-8000-0000000c0003

dc() { docker compose -f "$COMPOSE/compose.yaml" --profile core --profile plataforma "$@"; }
paso() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
json() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1], {}, {'d': d}))" "$1"; }

token() { # token <usuario>
  curl -sf -X POST "$OIDC_ISSUER/protocol/openid-connect/token" -d grant_type=password -d client_id=demo-cli \
    -d username="$1" -d password="$KC_CLAVE_SEMILLA" -d 'scope=openid aud-viajes aud-finanzas' | json "d['access_token']"
}

hoy() { TZ=America/La_Paz date +%F; }

cotizar() { # cotizar <token> <rutaId> <tipoCarga> <toneladas> [clienteId] -> cotizacionId
  local extra=""; [ -n "${5:-}" ] && extra=",\"clienteId\":\"$5\""
  curl -sf -X POST "$FINANZAS/api/v1/cotizaciones" -H "Authorization: Bearer $1" -H "Idempotency-Key: $(uuidgen)" \
    -H 'Content-Type: application/json' \
    -d "{\"rutaId\":\"$2\",\"tipoCarga\":\"$3\",\"toneladas\":$4,\"fechaViaje\":\"$(hoy)\"$extra}" | json "d['cotizacionId']"
}

confirmar() { # confirmar <token> <cotizacionId> [clienteId] [clave] -> cuerpo de la respuesta 202
  local extra=""; [ -n "${3:-}" ] && extra=",\"clienteId\":\"$3\""
  curl -sf -X POST "$VIAJES/api/v1/servicios" -H "Authorization: Bearer $1" -H "Idempotency-Key: ${4:-$(uuidgen)}" \
    -H 'Content-Type: application/json' -d "{\"cotizacionId\":\"$2\"$extra}"
}

servicio() { curl -sf "$VIAJES/api/v1/servicios/$2" -H "Authorization: Bearer $1"; }

esperar() { # esperar <token> <servicioId> <expresión python sobre d> [segundos] -> el servicio
  local fin=$((SECONDS + ${4:-60})) cuerpo
  while [ $SECONDS -lt $fin ]; do
    cuerpo=$(servicio "$1" "$2")
    if [ "$(echo "$cuerpo" | json "bool($3)")" = True ]; then echo "$cuerpo"; return 0; fi
    echo "  … $(echo "$cuerpo" | json "d['estado'] + ' ' + d.get('etapa', '')")" >&2
    sleep 2
  done
  echo "No llegó a: $3" >&2; echo "$cuerpo" >&2; return 1
}

esperado() { # esperado <descripción> <real> <esperado>
  if [ "$2" = "$3" ]; then echo "  ✔ $1: $2"; else echo "  ✘ $1: '$2' (se esperaba '$3')"; exit 1; fi
}

disponible() { # disponible <token admin> <clienteId>
  curl -sf "$FINANZAS/api/v1/lineas-credito/$2" -H "Authorization: Bearer $1" | json "d['disponible']['monto']"
}

liberar() { # liberar <servicioId>: cancela como despachador un servicio de prueba para devolver su furgón (hay 3)
  curl -sf -o /dev/null -X POST "$VIAJES/api/v1/servicios/$1/cancelacion" -H "Authorization: Bearer $(token despachador1)" \
    -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' -d '{"motivo":"Limpieza del script de prueba"}' \
    && echo "  (servicio $1 cancelado para liberar la unidad)"
}
