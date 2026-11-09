#!/usr/bin/env bash
# Aplica realm-transporte.json con keycloak-config-cli y luego configurar-api.sh (perfil, usuarios de semilla y FGAP v2).
# Los valores salen del entorno (local: --env-file .env; nube: secretos del Job keycloak-config, T11.3).
# Uso local: ./aplicar-realm.sh .env
# Con KC_CONFIG_EN_CONTENEDOR=1 (imagen Dockerfile.config) corre el jar directo en vez de docker run.
set -euo pipefail
if [ -n "${1:-}" ]; then set -a; . "$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; set +a; fi
cd "$(dirname "$0")"
: "${KC_URL:?}" "${KC_ADMIN:?}" "${KC_ADMIN_CLAVE:?}" "${KC_CLAVE_SEMILLA:?}"
CLI=(KEYCLOAK_USER="$KC_ADMIN" KEYCLOAK_PASSWORD="$KC_ADMIN_CLAVE"
  KEYCLOAK_AVAILABILITYCHECK_ENABLED=true KEYCLOAK_AVAILABILITYCHECK_TIMEOUT=120s
  IMPORT_VARSUBSTITUTION_ENABLED=true IMPORT_MANAGED_GROUP=no-delete IMPORT_MANAGED_REQUIRED_ACTION=no-delete)

if [ "${KC_CONFIG_EN_CONTENEDOR:-}" = 1 ]; then
  # Job de la nube (Dockerfile.config): el jar está en la misma imagen y los KC_* ya vienen en el entorno.
  env "${CLI[@]}" KEYCLOAK_URL="$KC_URL" IMPORT_FILES_LOCATIONS="$PWD/realm-transporte.json" \
    java ${JAVA_OPTS:-} -jar /app/keycloak-config-cli.jar
else
  IMAGEN=${KC_CONFIG_CLI_IMAGEN:-adorsys/keycloak-config-cli:6.5.1-26.5.5}
  # Desde el contenedor, localhost de la Mac es host.docker.internal.
  URL_CLI=${KC_URL/localhost/host.docker.internal}
  E=(); for v in "${CLI[@]}"; do E+=(-e "$v"); done
  docker run --rm --add-host=host.docker.internal:host-gateway \
    "${E[@]}" -e KEYCLOAK_URL="$URL_CLI" \
    -e IMPORT_FILES_LOCATIONS=/config/realm-transporte.json \
    --env-file <(env | grep -E '^KC_(SECRETO|CLAVE|URL_|DEMO_CLI|ACCESS_TOKEN|SSL)') \
    -v "$PWD/realm-transporte.json:/config/realm-transporte.json:ro" \
    "$IMAGEN"
fi

./configurar-api.sh
