# Paso 4 de reiniciar-demo.sh (local y --nube): borra en Keycloak a los clientes que se registraron en el portal.
# Necesita KC (URL base de Keycloak), KC_ADMIN y KC_ADMIN_CLAVE. Se carga con: . "$(dirname "$0")/demo/keycloak-registros.sh"
# Nunca borra cuentas de servicio, aunque hayan caído en el grupo (PB-5): se excluyen por id, como en configurar-api.sh.
ADMIN=$(curl -sf -X POST "$KC/realms/master/protocol/openid-connect/token" -d grant_type=password -d client_id=admin-cli \
  -d username="$KC_ADMIN" -d password="$KC_ADMIN_CLAVE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
GRUPO=$(curl -sf "$KC/admin/realms/transporte/groups?search=registro-portal&exact=true" -H "Authorization: Bearer $ADMIN" \
  | python3 -c 'import json,sys; g=json.load(sys.stdin); print(g[0]["id"] if g else "")')
if [ -n "$GRUPO" ]; then
  # Asignaciones fuera del for: si alguna falla, set -e corta antes de borrar con un conjunto incompleto.
  CLIENTES=$(curl -sf "$KC/admin/realms/transporte/clients?max=200" -H "Authorization: Bearer $ADMIN" \
    | python3 -c 'import json,sys; print(" ".join(c["id"] for c in json.load(sys.stdin) if c.get("serviceAccountsEnabled")))')
  CUENTAS=""
  for cl in $CLIENTES; do
    CUENTAS="$CUENTAS $(curl -sf "$KC/admin/realms/transporte/clients/$cl/service-account-user" -H "Authorization: Bearer $ADMIN" \
      | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
  done
  for u in $(curl -sf "$KC/admin/realms/transporte/groups/$GRUPO/members?max=500" -H "Authorization: Bearer $ADMIN" \
    | CUENTAS="$CUENTAS" python3 -c 'import json,os,sys; sa=set(os.environ["CUENTAS"].split()); print(" ".join(u["id"] for u in json.load(sys.stdin) if u["id"] not in sa))'); do
    curl -sf -X DELETE "$KC/admin/realms/transporte/users/$u" -H "Authorization: Bearer $ADMIN" && echo "   usuario $u borrado"
  done
fi

