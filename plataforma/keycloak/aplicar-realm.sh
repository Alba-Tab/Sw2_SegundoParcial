#!/usr/bin/env bash
# Aplica realm-transporte.json con keycloak-config-cli y luego configurar-api.sh (perfil, usuarios de semilla y FGAP v2).
# Los valores salen del entorno (local: --env-file .env; nube: secretos del Job keycloak-config, T11.3).
# Uso local: ./aplicar-realm.sh .env
set -euo pipefail
if [ -n "${1:-}" ]; then set -a; . "$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; set +a; fi
cd "$(dirname "$0")"
: "${KC_URL:?}" "${KC_ADMIN:?}" "${KC_ADMIN_CLAVE:?}" "${KC_CLAVE_SEMILLA:?}"
IMAGEN=${KC_CONFIG_CLI_IMAGEN:-adorsys/keycloak-config-cli:6.5.1-26.5.5}
# Desde el contenedor, localhost de la Mac es host.docker.internal.
URL_CLI=${KC_URL/localhost/host.docker.internal}

docker run --rm --add-host=host.docker.internal:host-gateway \
  -e KEYCLOAK_URL="$URL_CLI" -e KEYCLOAK_USER="$KC_ADMIN" -e KEYCLOAK_PASSWORD="$KC_ADMIN_CLAVE" \
  -e KEYCLOAK_AVAILABILITYCHECK_ENABLED=true -e KEYCLOAK_AVAILABILITYCHECK_TIMEOUT=120s \
  -e IMPORT_FILES_LOCATIONS=/config/realm-transporte.json \
  -e IMPORT_VARSUBSTITUTION_ENABLED=true \
  -e IMPORT_MANAGED_GROUP=no-delete -e IMPORT_MANAGED_REQUIRED_ACTION=no-delete \
  --env-file <(env | grep -E '^KC_(SECRETO|CLAVE|URL_|DEMO_CLI|ACCESS_TOKEN|SSL)') \
  -v "$PWD/realm-transporte.json:/config/realm-transporte.json:ro" \
  "$IMAGEN"

./configurar-api.sh
