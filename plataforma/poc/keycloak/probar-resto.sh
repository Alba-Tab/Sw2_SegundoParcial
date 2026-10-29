#!/usr/bin/env bash
# PoC-1: agente (client credentials → intercambio en mcp-server), K3, device grant de demo-cli y cierre de sesión por renovación.
set -uo pipefail
B=${KC:-http://localhost:8080}/realms/transporte/protocol/openid-connect
j() { python3 -I -c 'import sys,json;d=json.load(sys.stdin);print(d.get(sys.argv[1], d))' "$1"; }
c() { python3 -I -c 'import sys,json,base64;t=sys.argv[1].split(".")[1];d=json.loads(base64.urlsafe_b64decode(t+"="*(-len(t)%4)));print("azp",d.get("azp"),"aud",d.get("aud"),"roles",sorted(d.get("realm_access",{}).get("roles",[])))' "$1"; }
echo "== agente"
TA=$(curl -s $B/token -d grant_type=client_credentials -d client_id=agente -d client_secret=secreto-agente | j access_token); c "$TA"
T2=$(curl -s $B/token -d grant_type=urn:ietf:params:oauth:grant-type:token-exchange -d client_id=mcp-server -d client_secret=secreto-mcp-server \
  -d subject_token="$TA" -d subject_token_type=urn:ietf:params:oauth:token-type:access_token -d audience=analitica -d scope=aud-analitica | j access_token)
echo -n "mcp-server intercambia el token del agente → "; c "$T2"
echo "== K3"
for u in gerente1 chofer1; do echo -n "$u: "; c "$(curl -s $B/token -d grant_type=password -d client_id=demo-cli -d username=$u -d 'password=Clave123!' | j access_token)"; done
echo -n "offline_access para chofer1 (debe dar refresh offline): "; curl -s $B/token -d grant_type=password -d client_id=demo-cli -d username=chofer1 -d 'password=Clave123!' -d scope='openid offline_access' | python3 -I -c 'import sys,json,base64;d=json.load(sys.stdin);t=d["refresh_token"].split(".")[1];print(json.loads(base64.urlsafe_b64decode(t+"="*(-len(t)%4)))["typ"])'
echo -n "offline_access para gerente1 (debe fallar): "; curl -s $B/token -d grant_type=password -d client_id=demo-cli -d username=gerente1 -d 'password=Clave123!' -d scope='openid offline_access' | python3 -I -c 'import sys,json,base64;d=json.load(sys.stdin);t=d.get("refresh_token","x.e30.x").split(".")[1];print(d.get("error") or json.loads(base64.urlsafe_b64decode(t+"="*(-len(t)%4)))["typ"])'
echo "== device grant de demo-cli"
curl -s $B/auth/device -d client_id=demo-cli | python3 -I -c 'import sys,json;d=json.load(sys.stdin);print({k:d.get(k) for k in ("user_code","verification_uri","expires_in","interval")})'
echo "== cierre de sesión detectado al renovar"
R1=$(curl -s $B/token -d grant_type=password -d client_id=demo-cli -d username=gerente1 -d 'password=Clave123!' -d scope=openid)
RT=$(echo "$R1" | j refresh_token); IDT=$(echo "$R1" | j id_token)
echo "renovar antes del cierre: $(curl -s -o /dev/null -w '%{http_code}' $B/token -d grant_type=refresh_token -d client_id=demo-cli -d refresh_token=$RT)"
echo "cerrar sesión (end_session): $(curl -s -o /dev/null -w '%{http_code}' -X POST $B/logout -d client_id=demo-cli -d refresh_token=$RT)"
echo "renovar después del cierre: $(curl -s $B/token -d grant_type=refresh_token -d client_id=demo-cli -d refresh_token=$RT | j error)"
