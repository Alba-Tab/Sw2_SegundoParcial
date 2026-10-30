#!/usr/bin/env bash
# Carga plataforma/semilla en Viajes, Finanzas y Flota del compose local (D102): cada servicio la lee de su imagen y la
# escribe directo en su base, sin Outbox. Idempotente. Necesita los perfiles core y plataforma levantados.
# Uso: plataforma/semilla/cargar.sh
set -euo pipefail
cd "$(dirname "$0")/../compose"
c() { docker compose -f compose.yaml --profile core --profile plataforma "$@"; }

c run --rm --no-deps viajes --semilla.cargar=true --server.port=0 --temporal.worker.habilitado=false
c run --rm --no-deps finanzas-api sh -c 'php artisan migrate --force && php artisan semilla:cargar'
c run --rm --no-deps flota-worker node dist/semilla.js
echo "Semilla cargada en Viajes, Finanzas y Flota"
