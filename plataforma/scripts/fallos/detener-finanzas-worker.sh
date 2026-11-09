#!/usr/bin/env bash
# FC1 (local): detiene el worker de Finanzas (actividades, consumidor y relay). Se enciende con `start finanzas-worker`.
docker compose -f "$(dirname "$0")/../../compose/compose.yaml" --profile core stop finanzas-worker
