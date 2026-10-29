#!/usr/bin/env bash
# PoC-1 / K4: FGAP v2. La cuenta de servicio de `viajes` solo gestiona miembros del grupo registro-portal y solo asigna el rol cliente.
set -euo pipefail
K="docker exec poc-kc /opt/keycloak/bin/kcadm.sh"; R="-r transporte"
$K config credentials --server http://localhost:8080 --realm master --user admin --password admin >/dev/null
AP=$($K get clients $R -q clientId=admin-permissions --fields id --format csv --noquotes)
VI=$($K get clients $R -q clientId=viajes --fields id --format csv --noquotes)
GID=$($K get groups $R --fields id,name --format csv --noquotes | awk -F, '$2=="registro-portal"{print $1}')
RID=$($K get roles/cliente $R --fields id --format csv --noquotes)
BASE=clients/$AP/authz/resource-server
$K create $BASE/policy/client $R -s name=es-viajes -s "clients=[\"$VI\"]" >/dev/null
POL=$($K get $BASE/policy $R -q name=es-viajes --fields id,name --format csv --noquotes | awk -F, '$2=="es-viajes"{print $1}')
$K create $BASE/permission/scope $R -s name=viajes-miembros-registro -s resourceType=Groups -s "resources=[\"$GID\"]" -s 'scopes=["view-members","manage-members"]' -s "policies=[\"$POL\"]" >/dev/null
$K create $BASE/permission/scope $R -s name=viajes-asigna-cliente -s resourceType=Roles -s "resources=[\"$RID\"]" -s 'scopes=["map-role"]' -s "policies=[\"$POL\"]" >/dev/null
# Los usuarios internos no deben quedar en el grupo de registro.
for u in gerente1 chofer1; do UID_=$($K get users $R -q username=$u --fields id --format csv --noquotes); $K delete users/$UID_/groups/$GID $R; done
echo "FGAP v2 configurado"
# Para buscar usuarios por username hace falta query-users; FGAP v2 filtra el resultado a los que puede ver.
$K add-roles $R --uusername service-account-viajes --cclientid realm-management --rolename query-users
echo "query-users asignado a viajes"
# map-roles solo existe en el tipo Users (no hay "map-roles de miembros" en Groups). Se da para todos los usuarios,
# pero map-role sigue limitado al rol cliente: viajes puede asignar cliente a cualquiera y ningún otro rol.
AP=$($K get clients $R -q clientId=admin-permissions --fields id --format csv --noquotes)
POL=$($K get clients/$AP/authz/resource-server/policy $R -q name=es-viajes --fields id --format csv --noquotes)
$K create clients/$AP/authz/resource-server/permission/scope $R -s name=viajes-map-roles-usuarios -s resourceType=Users -s 'scopes=["map-roles"]' -s "policies=[\"$POL\"]" >/dev/null
echo "map-roles en Users asignado a viajes"
