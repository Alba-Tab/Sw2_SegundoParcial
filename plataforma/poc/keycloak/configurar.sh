#!/usr/bin/env bash
# PoC-1: configura el realm `transporte` con kcadm dentro del contenedor poc-kc.
set -euo pipefail
K="docker exec poc-kc /opt/keycloak/bin/kcadm.sh"
$K config credentials --server http://localhost:8080 --realm master --user admin --password admin >/dev/null
$K delete realms/transporte >/dev/null 2>&1 || true
$K create realms -s realm=transporte -s enabled=true -s registrationAllowed=true -s verifyEmail=false \
  -s accessTokenLifespan=300 -s ssoSessionIdleTimeout=1800 -s ssoSessionMaxLifespan=36000 -s adminPermissionsEnabled=true
R="-r transporte"

# K3: roles del realm sin rol por defecto; chofer incluye offline_access.
$K remove-roles $R --rname default-roles-transporte --rolename offline_access --rolename uma_authorization
for rol in chofer despachador jefe_flota administracion gerente comercial cliente agente_lectura; do $K create roles $R -s name=$rol >/dev/null; done
$K add-roles $R --rname chofer --rolename offline_access

# Perfil de usuario: atributo clienteId, editable y visible solo por administradores.
PERFIL=$(mktemp)
$K get users/profile $R > "$PERFIL"
python3 -I - "$PERFIL" <<'PY2'
import json,sys
ruta=sys.argv[1]; p=json.load(open(ruta))
p['attributes']=[a for a in p['attributes'] if a['name']!='clienteId']+[{"name":"clienteId","displayName":"clienteId","permissions":{"view":["admin"],"edit":["admin"]},"multivalued":False}]
json.dump(p,open(ruta,'w'))
PY2
chmod 644 "$PERFIL"; docker cp "$PERFIL" poc-kc:/tmp/perfil.json && rm -f "$PERFIL"
$K update users/profile $R -f /tmp/perfil.json

# Client scopes: claim clienteId y una audiencia por servicio (K2).
csid() { $K get client-scopes $R --fields id,name --format csv --noquotes | awk -F, -v n="$1" '$2==n{print $1}'; }
$K create client-scopes $R -s name=cliente-id -s protocol=openid-connect -s 'attributes."include.in.token.scope"=false' >/dev/null
$K create client-scopes/$(csid cliente-id)/protocol-mappers/models $R -s name=clienteId -s protocol=openid-connect -s protocolMapper=oidc-usermodel-attribute-mapper \
  -s 'config."user.attribute"=clienteId' -s 'config."claim.name"=clienteId' -s 'config."access.token.claim"=true' -s 'config."id.token.claim"=true' -s 'config."jsonType.label"=String' >/dev/null
for svc in gateway analitica mcp-server viajes finanzas flota; do
  $K create client-scopes $R -s name=aud-$svc -s protocol=openid-connect -s 'attributes."include.in.token.scope"=false' >/dev/null
  $K create client-scopes/$(csid aud-$svc)/protocol-mappers/models $R -s name=aud-$svc -s protocol=openid-connect -s protocolMapper=oidc-audience-mapper \
    -s "config.\"included.client.audience\"=$svc" -s 'config."access.token.claim"=true' >/dev/null
done

# Clientes.
cid() { $K get clients $R -q clientId="$1" --fields id --format csv --noquotes; }
nuevo_publico() { $K create clients $R -s clientId=$1 -s publicClient=true -s standardFlowEnabled=true -s "directAccessGrantsEnabled=$2" -s 'redirectUris=["http://localhost:*"]' -s 'webOrigins=["+"]' >/dev/null; }
nuevo_confidencial() { $K create clients $R -s clientId=$1 -s publicClient=false -s secret=secreto-$1 -s standardFlowEnabled=false -s "serviceAccountsEnabled=$2" \
  -s 'attributes."standard.token.exchange.enabled"=true' >/dev/null; }
nuevo_publico demo-cli true
nuevo_publico cc-tablero false
nuevo_publico portal-cliente false
for c in gateway analitica mcp-server; do nuevo_confidencial $c false; done
nuevo_confidencial agente true
nuevo_confidencial viajes true
for c in finanzas flota; do $K create clients $R -s clientId=$c -s publicClient=false -s secret=secreto-$c -s standardFlowEnabled=false -s bearerOnly=false >/dev/null; done
$K update clients/$(cid demo-cli) $R -s 'attributes."oauth2.device.authorization.grant.enabled"=true'

scope() { $K update clients/$(cid $1)/$2-client-scopes/$(csid $3) $R >/dev/null; }
scope demo-cli default aud-gateway; scope demo-cli default cliente-id
scope cc-tablero default aud-gateway
scope portal-cliente default aud-viajes; scope portal-cliente default aud-finanzas; scope portal-cliente default cliente-id
scope gateway optional aud-analitica; scope gateway optional aud-finanzas; scope gateway optional aud-viajes; scope gateway optional aud-flota
scope analitica optional aud-mcp-server
scope mcp-server optional aud-analitica; scope mcp-server optional aud-viajes; scope mcp-server optional aud-finanzas; scope mcp-server optional aud-flota
scope agente default aud-mcp-server

# Cuenta de servicio del agente con agente_lectura.
$K add-roles $R --uusername service-account-agente --rolename agente_lectura

# Grupo registro-portal como grupo por defecto (K4).
$K create groups $R -s name=registro-portal >/dev/null
GID=$($K get groups $R --fields id,name --format csv --noquotes | awk -F, '$2=="registro-portal"{print $1}')
$K update realms/transporte/default-groups/$GID $R >/dev/null

# Usuarios de prueba (solo PoC).
usuario() { $K create users $R -s username=$1 -s enabled=true -s email=$1@transporte.example -s emailVerified=true -s firstName=$1 -s lastName=Prueba >/dev/null
  $K set-password $R --username $1 --new-password 'Clave123!' >/dev/null; [ -n "${2:-}" ] && $K add-roles $R --uusername $1 --rolename $2 || true; }
usuario gerente1 gerente; usuario chofer1 chofer; usuario nuevo1
echo "realm transporte configurado"
