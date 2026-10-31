#!/usr/bin/env bash
# Smoke del realm `transporte` (local, con direct grant de demo-cli). Repite las pruebas de la PoC-1 sobre el realm definitivo:
# ids fijos, claims, cadena de 3 intercambios (K1), agente, K3, FGAP v2 (K4), device grant y cierre de sesión (D27, D39).
# Uso: ./probar-realm.sh .env   (sale con código 1 si alguna prueba falla)
set -uo pipefail
if [ -n "${1:-}" ]; then set -a; . "$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; set +a; fi
cd "$(dirname "$0")"
: "${KC_URL:?}" "${KC_ADMIN:?}" "${KC_ADMIN_CLAVE:?}" "${KC_CLAVE_SEMILLA:?}" "${KC_SECRETO_GATEWAY:?}" "${KC_SECRETO_ANALITICA:?}" \
  "${KC_SECRETO_MCP_SERVER:?}" "${KC_SECRETO_AGENTE:?}" "${KC_SECRETO_VIAJES:?}"
O=$KC_URL/realms/transporte/protocol/openid-connect
A=$KC_URL/admin/realms/transporte
FALLAS=0
ok() { if [ "$2" = "$3" ]; then printf '  ok    %s\n' "$1"; else printf '  FALLA %s (esperado %s, obtenido %s)\n' "$1" "$3" "$2"; FALLAS=$((FALLAS+1)); fi; }
claims() { jq -R 'split(".")[1] | gsub("-";"+") | gsub("_";"/") | @base64d | fromjson' <<<"$1"; }
roles() { claims "$1" | jq -r '[.realm_access.roles[]? | select(. != "default-roles-transporte")] | sort | join(",")'; }
aud() { claims "$1" | jq -r '[.aud] | flatten | map(select(. != null)) | sort | join(",")'; }
login() { curl -s "$O/token" -d grant_type=password -d client_id=demo-cli --data-urlencode "username=$1" --data-urlencode "password=$KC_CLAVE_SEMILLA" --data-urlencode "scope=${2:-openid}"; }
intercambio() { # cliente secreto token audiencia
  curl -s "$O/token" -d grant_type=urn:ietf:params:oauth:grant-type:token-exchange -d client_id=$1 -d client_secret=$2 -d subject_token=$3 \
    -d subject_token_type=urn:ietf:params:oauth:token-type:access_token -d requested_token_type=urn:ietf:params:oauth:token-type:access_token \
    -d audience=$4 -d scope=aud-$4 | jq -r '.access_token // empty'; }
ADM=$(curl -s "$KC_URL/realms/master/protocol/openid-connect/token" -d grant_type=password -d client_id=admin-cli \
  --data-urlencode "username=$KC_ADMIN" --data-urlencode "password=$KC_ADMIN_CLAVE" | jq -r .access_token)
adm() { curl -s -H "Authorization: Bearer $ADM" -H 'Content-Type: application/json' "$@"; }

echo "== Usuarios de semilla (D12)"
T=$(login gerente1 | jq -r .access_token)
ok "sub de gerente1 es el id fijo" "$(claims "$T" | jq -r .sub)" 0193a000-0000-7000-8000-000000000001
ok "gerente1: roles" "$(roles "$T")" gerente
ok "gerente1: sin clienteId" "$(claims "$T" | jq -r '.clienteId // "-"')" -
TC=$(login agroexport | jq -r .access_token)
ok "agroexport: rol cliente" "$(roles "$TC")" cliente
ok "agroexport: clienteId" "$(claims "$TC" | jq -r .clienteId)" 0193a000-0000-7000-8000-0000000c0001
GRUPO=$(adm "$A/groups?search=registro-portal&exact=true" | jq -r '.[0].id')
ok "registro-portal sin usuarios de semilla" "$(adm "$A/groups/$GRUPO/members" | jq length)" 0

echo "== Intercambio: demo-cli → gateway → analitica (la voz no pasa por el MCP, spec 015)"
SID=$(claims "$T" | jq -r .sid)
T1=$(intercambio gateway "$KC_SECRETO_GATEWAY" "$T" analitica)
ok "salto aud" "$(aud "$T1")" analitica
ok "conserva sub y sid" "$(claims "$T1" | jq -r '.sub + " " + .sid')" "0193a000-0000-7000-8000-000000000001 $SID"
ok "conserva roles (fullScopeAllowed=false)" "$(roles "$T1")" gerente
ok "gateway no intercambia hacia mcp-server" "$(intercambio gateway "$KC_SECRETO_GATEWAY" "$T" mcp-server)" ""
ok "analitica no intercambia hacia mcp-server" "$(intercambio analitica "$KC_SECRETO_ANALITICA" "$T1" mcp-server)" ""

echo "== Agente"
TA=$(curl -s "$O/token" -d grant_type=client_credentials -d client_id=agente -d client_secret="$KC_SECRETO_AGENTE" | jq -r .access_token)
ok "agente: rol y aud" "$(roles "$TA") $(aud "$TA")" "agente_lectura mcp-server"
TA2=$(intercambio mcp-server "$KC_SECRETO_MCP_SERVER" "$TA" analitica)
ok "mcp-server intercambia el token del agente" "$(roles "$TA2") $(aud "$TA2")" "agente_lectura analitica"

echo "== K3: offline_access solo para chofer"
ok "chofer1 recibe refresh Offline" "$(claims "$(login chofer1 'openid offline_access' | jq -r .refresh_token)" | jq -r .typ)" Offline
ok "gerente1 no recibe offline_access" "$(login gerente1 'openid offline_access' | jq -r '.error // "token"')" not_allowed
ok "chofer1: roles" "$(roles "$(login chofer1 | jq -r .access_token)")" chofer,offline_access

echo "== K4: FGAP v2 de viajes"
adm -X POST "$A/users" -d '{"username":"prueba-registro","enabled":true,"email":"prueba-registro@transporte.example","firstName":"Prueba","lastName":"Registro","credentials":[{"type":"password","value":"'"$KC_CLAVE_SEMILLA"'","temporary":false}]}' >/dev/null
N=$(claims "$(login prueba-registro | jq -r .access_token)" | jq -r .sub)
ok "usuario nuevo queda en registro-portal" "$(adm "$A/users/$N/groups" | jq -r '.[0].name')" registro-portal
TV=$(curl -s "$O/token" -d grant_type=client_credentials -d client_id=viajes -d client_secret="$KC_SECRETO_VIAJES" | jq -r .access_token)
v() { curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TV" -H 'Content-Type: application/json' "$@"; }
REP=$(curl -s -H "Authorization: Bearer $TV" "$A/users/$N" | jq -c '.attributes.clienteId = ["0193a000-0000-7000-8000-0000000c0099"]')
CR=$(adm "$A/roles/cliente" | jq -c '{id,name}'); GR=$(adm "$A/roles/gerente" | jq -c '{id,name}')
ok "viajes lee al usuario nuevo" "$(v "$A/users/$N")" 200
ok "viajes escribe clienteId" "$(v -X PUT "$A/users/$N" -d "$REP")" 204
ok "viajes asigna cliente" "$(v -X POST "$A/users/$N/role-mappings/realm" -d "[$CR]")" 204
ok "viajes no asigna gerente" "$(v -X POST "$A/users/$N/role-mappings/realm" -d "[$GR]")" 403
ok "viajes no lee a gerente1" "$(v "$A/users/0193a000-0000-7000-8000-000000000001")" 403
ok "viajes no edita a gerente1" "$(v -X PUT "$A/users/0193a000-0000-7000-8000-000000000001" -d '{"firstName":"x"}')" 403
TN=$(login prueba-registro | jq -r .access_token)
ok "token nuevo trae cliente y clienteId" "$(roles "$TN") $(claims "$TN" | jq -r .clienteId)" "cliente 0193a000-0000-7000-8000-0000000c0099"
adm -X DELETE "$A/users/$N" >/dev/null

echo "== D39 y D27"
ok "device grant de demo-cli" "$(curl -s "$O/auth/device" -d client_id=demo-cli | jq -r '.user_code | length > 0')" true
R=$(login gerente1); RT=$(jq -r .refresh_token <<<"$R")
ok "renovar antes del cierre" "$(curl -s -o /dev/null -w '%{http_code}' "$O/token" -d grant_type=refresh_token -d client_id=demo-cli -d refresh_token="$RT")" 200
curl -s -o /dev/null -X POST "$O/logout" -d client_id=demo-cli -d refresh_token="$RT"
ok "renovar después del cierre" "$(curl -s "$O/token" -d grant_type=refresh_token -d client_id=demo-cli -d refresh_token="$RT" | jq -r .error)" invalid_grant

echo; if [ $FALLAS -eq 0 ]; then echo "realm OK"; else echo "$FALLAS pruebas fallaron"; exit 1; fi
