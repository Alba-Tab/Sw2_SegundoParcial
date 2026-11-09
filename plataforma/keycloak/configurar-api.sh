#!/usr/bin/env bash
# Segundo paso del realm, por la API de administración, para lo que keycloak-config-cli 6.5.1 no aplica:
#  1. Perfil de usuario con el atributo clienteId (vista y edición solo de administradores).
#  2. Usuarios de semilla con ids fijos (D12, K5): partialImport conserva el id; si el usuario existe, se salta.
#     Ni ellos ni las cuentas de servicio quedan en registro-portal.
#  3. FGAP v2 (K4): la cuenta de servicio de `viajes` solo ve y gestiona miembros de registro-portal
#     y solo asigna el rol `cliente` (los permisos referencian ids de grupo y de rol).
#  4. FGAP v2 (D103): el gerente solo ve y gestiona miembros de personal-interno y solo asigna roles internos.
#     Sus roles de realm-management (grupo administra-usuarios) no están en ningún scope: no llegan a los tokens de las apps.
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
# Grupos de la semilla (personal-interno, administra-usuarios): también para los que partialImport saltó.
jq -r '.users[] | .id as $id | .groups[] | "\($id) \(.)"' usuarios-semilla.json | while read -r id ruta; do
  api -X PUT "$A/users/$id/groups/$(api "$A/group-by-path$ruta" | jq -r .id)" >/dev/null
done
# Las cuentas de servicio creadas después de defaultGroups también caen en registro-portal (PB-5): fuera, por id exacto.
# No por prefijo: una persona puede registrarse con el usuario `service-account-x`.
for cl in $(api "$A/clients?max=200" | jq -r '.[] | select(.serviceAccountsEnabled == true) | .id'); do
  api -X DELETE "$A/users/$(api "$A/clients/$cl/service-account-user" | jq -r .id)/groups/$GRUPO" >/dev/null 2>&1 || true
done

# 3 y 4. FGAP v2. Con varios permisos sobre el mismo recurso, Keycloak exige que todos concedan (UNANIMOUS):
# por eso viajes-map-roles-usuarios (todos los usuarios) le quita al gerente lo que le daría personal-interno,
# y el gerente lleva además un permiso por usuario (gerente-usuarios-internos) que gana sobre el de tipo.
AP=$(api "$A/clients?clientId=admin-permissions" | jq -r '.[0].id')
RS=$A/clients/$AP/authz/resource-server
cid() { api "$A/clients?clientId=$1" | jq -r '.[0].id'; }
rol() { api "$A/roles/$1" | jq -r .id; }
politica() { # nombre tipo cuerpo(json) -> id; si existe, la actualiza
  local id; id=$(api "$RS/policy?name=$1&exact=true" | jq -r '.[0].id // empty')
  if [ -z "$id" ]; then id=$(api -X POST "$RS/policy/$2" -d "$3" | jq -r .id)
  else api -X PUT "$RS/policy/$2/$id" -d "$(jq -c --arg id "$id" '.id = $id' <<<"$3")" >/dev/null; fi
  echo "$id"
}
permiso() { # nombre tipo recursos(json) scopes(json) politicas(json); si existe, lo actualiza
  local id cuerpo
  cuerpo=$(jq -nc --arg n "$1" --arg t "$2" --argjson r "$3" --argjson s "$4" --argjson p "$5" \
    '{name:$n, resourceType:$t, resources:$r, scopes:$s, policies:$p, decisionStrategy:"UNANIMOUS"}')
  id=$(api "$RS/permission?name=$1&exact=true" | jq -r '.[0].id // empty')
  if [ -z "$id" ]; then api -X POST "$RS/permission/scope" -d "$cuerpo" >/dev/null; echo "permiso creado: $1"
  else api -X PUT "$RS/permission/scope/$id" -d "$(jq -c --arg id "$id" '.id = $id' <<<"$cuerpo")" >/dev/null; echo "permiso actualizado: $1"; fi
}
ids() { jq -Rcs 'split("\n") | map(select(length > 0))'; }

POL=$(politica es-viajes client "$(jq -nc --arg c "$(cid viajes)" '{name:"es-viajes", clients:[$c]}')")
permiso viajes-miembros-registro Groups "[\"$GRUPO\"]" '["view-members","manage-members"]' "[\"$POL\"]"
permiso viajes-asigna-cliente Roles "[\"$(rol cliente)\"]" '["map-role"]' "[\"$POL\"]"
# map-roles solo existe en el tipo Users: se da para todos, pero map-role limita a `cliente`.
permiso viajes-map-roles-usuarios Users '[]' '["map-roles"]' "[\"$POL\"]"

# El gerente (D103): rol gerente leído del usuario (la consola usa tokens livianos, sin roles) y solo desde la consola
# o admin-cli, para que un token de cc-*, del Gateway o de un intercambio no sirva contra la Admin API.
GER=$(politica es-gerente role "$(jq -nc --arg r "$(rol gerente)" '{name:"es-gerente", fetchRoles:true, roles:[{id:$r, required:false}]}')")
CON=$(politica desde-consola client "$(jq -nc --arg a "$(cid security-admin-console)" --arg b "$(cid admin-cli)" '{name:"desde-consola", clients:[$a,$b]}')")
INTERNO=$(api "$A/group-by-path/personal-interno" | jq -r .id)
permiso gerente-miembros-internos Groups "[\"$INTERNO\"]" '["view-members","manage-members"]' "[\"$GER\",\"$CON\"]"
# shortcut: foto de los miembros de personal-interno al aplicar; quien entra después necesita volver a correr este script.
permiso gerente-usuarios-internos Users "$(api "$A/groups/$INTERNO/members?max=1000&briefRepresentation=true" | jq -r '.[].id' | ids)" \
  '["view","manage","map-roles"]' "[\"$GER\",\"$CON\"]"
permiso gerente-asigna-roles-internos Roles "$(for r in despachador jefe_flota administracion comercial chofer; do rol "$r"; done | ids)" \
  '["map-role"]' "[\"$GER\",\"$CON\"]"
echo "FGAP v2 configurado"
