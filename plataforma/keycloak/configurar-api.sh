#!/usr/bin/env bash
# Segundo paso del realm, por la API de administración, para lo que keycloak-config-cli 6.5.1 no aplica:
#  1. Perfil de usuario con el atributo clienteId (vista y edición solo de administradores).
#  2. Usuarios de semilla con ids fijos (D12, K5): partialImport conserva el id; si el usuario existe, se salta.
#  3. FGAP v2 (K4): la cuenta de servicio de `viajes` solo ve y gestiona miembros de registro-portal
#     y solo asigna el rol `cliente` (los permisos referencian ids de grupo y de rol).
# Es idempotente. Uso: KC_URL=... KC_ADMIN=... KC_ADMIN_CLAVE=... KC_CLAVE_SEMILLA=... ./configurar-api.sh
set -euo pipefail
cd "$(dirname "$0")"
: "${KC_URL:?}" "${KC_ADMIN:?}" "${KC_ADMIN_CLAVE:?}" "${KC_CLAVE_SEMILLA:?}"
A=$KC_URL/admin/realms/transporte
TOKEN=$(curl -sf "$KC_URL/realms/master/protocol/openid-connect/token" -d grant_type=password -d client_id=admin-cli \
  --data-urlencode "username=$KC_ADMIN" --data-urlencode "password=$KC_ADMIN_CLAVE" | jq -r .access_token)
api() { curl -sf -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' "$@"; }

# 1. Perfil de usuario.
api -X PUT "$A/users/profile" -d @perfil-usuario.json >/dev/null
echo "perfil de usuario aplicado"

# 2. Usuarios de semilla. La contraseña sale del entorno, nunca del archivo.
jq --arg clave "$KC_CLAVE_SEMILLA" '.users[].credentials[].value = $clave' usuarios-semilla.json \
  | api -X POST "$A/partialImport" -d @- | jq -r '"usuarios: \(.added) creados, \(.skipped) ya existían"'
# Los internos y los clientes de semilla no deben quedar en registro-portal (grupo por defecto del autorregistro).
GRUPO=$(api "$A/groups?search=registro-portal&exact=true" | jq -r '.[0].id')
for id in $(jq -r '.users[].id' usuarios-semilla.json); do
  api -X DELETE "$A/users/$id/groups/$GRUPO" >/dev/null 2>&1 || true
done

# 3. FGAP v2.
AP=$(api "$A/clients?clientId=admin-permissions" | jq -r '.[0].id')
VI=$(api "$A/clients?clientId=viajes" | jq -r '.[0].id')
ROL=$(api "$A/roles/cliente" | jq -r .id)
RS=$A/clients/$AP/authz/resource-server
POL=$(api "$RS/policy?name=es-viajes&exact=true" | jq -r '.[0].id // empty')
if [ -z "$POL" ]; then
  POL=$(api -X POST "$RS/policy/client" -d "{\"name\":\"es-viajes\",\"clients\":[\"$VI\"]}" | jq -r .id)
fi
permiso() { # nombre tipo recursos(json) scopes(json)
  if [ -z "$(api "$RS/permission?name=$1&exact=true" | jq -r '.[0].id // empty')" ]; then
    api -X POST "$RS/permission/scope" -d "{\"name\":\"$1\",\"resourceType\":\"$2\",\"resources\":$3,\"scopes\":$4,\"policies\":[\"$POL\"]}" >/dev/null
    echo "permiso creado: $1"
  else
    echo "permiso ya existe: $1"
  fi
}
permiso viajes-miembros-registro Groups "[\"$GRUPO\"]" '["view-members","manage-members"]'
permiso viajes-asigna-cliente Roles "[\"$ROL\"]" '["map-role"]'
# map-roles solo existe en el tipo Users: se da para todos, pero map-role limita a `cliente`.
permiso viajes-map-roles-usuarios Users '[]' '["map-roles"]'
echo "FGAP v2 configurado"
