#!/usr/bin/env bash
# Corre Pest, Deptrac y Larastan dentro de la imagen de desarrollo, en la red del compose local (PostgreSQL de
# "Azure" y RabbitMQ). Crea la base finanzas_test si falta. Uso: ./probar.sh
set -euo pipefail
cd "$(dirname "$0")"
COMPOSE=../../plataforma/compose
set -a; . "$COMPOSE/.env"; set +a
docker compose -f "$COMPOSE/compose.yaml" exec -T postgres-azure psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='finanzas_test'" | grep -q 1 \
  || docker compose -f "$COMPOSE/compose.yaml" exec -T postgres-azure psql -U postgres -c "CREATE DATABASE finanzas_test OWNER finanzas"
docker build -q --target dev -t transporte/finanzas-dev:local . >/dev/null
docker run --rm --network "${COMPOSE_PROJECT_NAME:-transporte}_default" \
  -e DB_HOST=postgres-azure -e DB_PORT=5432 -e DB_USERNAME=finanzas -e DB_PASSWORD="$CLAVE_FINANZAS" \
  -e AMQP_HOST=rabbitmq -e AMQP_USUARIO=finanzas -e AMQP_CLAVE="$RABBITMQ_CLAVE_FINANZAS" \
  -e RABBITMQ_ADMIN="$RABBITMQ_ADMIN" -e RABBITMQ_ADMIN_CLAVE="$RABBITMQ_ADMIN_CLAVE" \
  transporte/finanzas-dev:local sh -c 'vendor/bin/pest && vendor/bin/deptrac analyse --no-progress && vendor/bin/phpstan analyse --no-progress --memory-limit=1G'
