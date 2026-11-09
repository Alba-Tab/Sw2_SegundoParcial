#!/bin/sh
# Segundo paso del realm (perfil, usuarios de semilla con id fijo y FGAP v2), después de keycloak-config-cli.
set -eu
apk add --no-cache -q bash curl jq >/dev/null
exec bash /realm/configurar-api.sh
