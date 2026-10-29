#!/usr/bin/env bash
# PoC-1 / K1: cc-tablero → gateway → analitica → mcp-server → analitica (3 intercambios estándar, RFC 8693).
set -uo pipefail
KC=${KC:-http://localhost:8080}/realms/transporte/protocol/openid-connect/token
claims() { python3 -I -c 'import sys,json,base64; p=sys.argv[1].split(".")[1]; d=json.loads(base64.urlsafe_b64decode(p+"="*(-len(p)%4))); print({k:d.get(k) for k in ("sub","azp","aud","sid","clienteId")}, "roles:", sorted(d.get("realm_access",{}).get("roles",[])))' "$1"; }
campo() { python3 -I -c 'import sys,json; d=json.load(sys.stdin); print(d.get(sys.argv[1]) or d)' "$1"; }
intercambio() { # cliente secreto token audiencia
  curl -s -o /tmp/r.json -w '%{http_code}' $KC -d grant_type=urn:ietf:params:oauth:grant-type:token-exchange \
    -d client_id=$1 -d client_secret=$2 -d subject_token=$3 -d subject_token_type=urn:ietf:params:oauth:token-type:access_token \
    -d requested_token_type=urn:ietf:params:oauth:token-type:access_token -d audience=$4 -d scope=aud-$4; }
T0=$(curl -s $KC -d grant_type=password -d client_id=demo-cli -d username=${USUARIO:-gerente1} -d 'password=Clave123!' -d scope=openid | campo access_token)
echo "token inicial:"; claims "$T0"
T=$T0; n=1
for paso in "gateway secreto-gateway analitica" "analitica secreto-analitica mcp-server" "mcp-server secreto-mcp-server analitica"; do
  set -- $paso
  cod=$(intercambio $1 $2 "$T" $3)
  if [ "$cod" = 200 ]; then T=$(campo access_token < /tmp/r.json); echo "intercambio $n ($1 → aud $3): 200"; claims "$T"
  else echo "intercambio $n ($1 → aud $3): $cod $(cat /tmp/r.json)"; exit 1; fi
  n=$((n+1))
done
echo "OK: cadena de 3 intercambios completa"
