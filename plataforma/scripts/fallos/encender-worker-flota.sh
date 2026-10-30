#!/usr/bin/env bash
docker compose -f "$(dirname "$0")/../../compose/compose.yaml" --profile core start flota-worker
