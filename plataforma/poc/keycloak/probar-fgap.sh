#!/usr/bin/env bash
# PoC-1 / K4: la cuenta de servicio de viajes usa el `sub` del token del usuario (= id en Keycloak), sin buscar.
# Debe poder escribir clienteId y asignar `cliente` a un miembro de registro-portal, y nada más.
set -uo pipefail
B=${KC:-http://localhost:8080}; A=$B/admin/realms/transporte
k() { docker exec poc-kc /opt/keycloak/bin/kcadm.sh "$@"; }
tok() { curl -s $B/realms/transporte/protocol/openid-connect/token "$@" | python3 -I -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'; }
sub() { python3 -I -c 'import sys,json,base64;t=sys.argv[1].split(".")[1];print(json.loads(base64.urlsafe_b64decode(t+"="*(-len(t)%4)))["sub"])' "$1"; }
TV=$(tok -d grant_type=client_credentials -d client_id=viajes -d client_secret=secreto-viajes)
H=(-H "Authorization: Bearer $TV" -H 'Content-Type: application/json')
N=$(sub "$(tok -d grant_type=password -d client_id=demo-cli -d username=nuevo1 -d 'password=Clave123!')")
G=$(sub "$(tok -d grant_type=password -d client_id=demo-cli -d username=gerente1 -d 'password=Clave123!')")
REP=$(curl -s "${H[@]}" $A/users/$N | python3 -I -c 'import sys,json;u=json.load(sys.stdin);u.setdefault("attributes",{})["clienteId"]=["01933b5a-1f00-7a20-8b11-0c2d3e4f5a01"];print(json.dumps(u))')
CR=$(k get roles/cliente -r transporte --fields id,name); GR=$(k get roles/gerente -r transporte --fields id,name)
r() { printf '%-48s %s\n' "$1" "$2"; }
r "GET nuevo1 (miembro de registro-portal)" "$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" $A/users/$N)"
r "PUT clienteId a nuevo1" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "${H[@]}" $A/users/$N -d "$REP")"
r "asignar rol cliente a nuevo1" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "${H[@]}" $A/users/$N/role-mappings/realm -d "[$CR]")"
r "asignar rol gerente a nuevo1 (debe fallar)" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "${H[@]}" $A/users/$N/role-mappings/realm -d "[$GR]")"
r "GET gerente1 (debe fallar)" "$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" $A/users/$G)"
r "PUT a gerente1 (debe fallar)" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "${H[@]}" $A/users/$G -d '{"firstName":"x"}')"
python3 -I -c 'import sys,json,base64;t=sys.argv[1].split(".")[1];d=json.loads(base64.urlsafe_b64decode(t+"="*(-len(t)%4)));print("token nuevo de nuevo1 → clienteId:",d.get("clienteId"),"| roles:",sorted(d["realm_access"]["roles"]))' "$(tok -d grant_type=password -d client_id=demo-cli -d username=nuevo1 -d 'password=Clave123!')"
