#!/usr/bin/env bash
# FS5 y FS8 (local): detiene el worker de Flota; las actividades Flota.* quedan programadas en Temporal.
docker compose -f "$(dirname "$0")/../../compose/compose.yaml" --profile core stop flota-worker
