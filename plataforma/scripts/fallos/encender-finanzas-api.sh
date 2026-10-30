#!/usr/bin/env bash
# Local (guion-fallos.md, sección 2): docker compose start finanzas-api.
docker compose -f "$(dirname "$0")/../../compose/compose.yaml" --profile core --profile plataforma start finanzas-api
