#!/usr/bin/env bash
# FS6 (local): detiene la API y el worker de Viajes (el mismo contenedor). Se enciende con `docker compose start viajes`.
docker compose -f "$(dirname "$0")/../../compose/compose.yaml" --profile core stop viajes
