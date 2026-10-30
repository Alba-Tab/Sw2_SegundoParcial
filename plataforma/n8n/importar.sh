#!/bin/sh
# Importa las credenciales (desde el entorno, nunca del repo) y los flujos de plataforma/n8n/flujos, y los publica.
# Corre una vez antes de n8n, con su misma base y su clave de cifrado. Idempotente: reimportar reemplaza por id.
set -eu
cat > /tmp/credenciales.json <<JSON
[
  {"id": "rabbitN8nLocal01", "name": "RabbitMQ n8n", "type": "rabbitmq",
   "data": {"hostname": "${AMQP_HOST}", "port": ${AMQP_PORT}, "username": "n8n", "password": "${RABBITMQ_CLAVE_N8N}", "vhost": "/", "ssl": false}},
  {"id": "postgresN8nLoc01", "name": "PostgreSQL n8n", "type": "postgres",
   "data": {"host": "${DB_POSTGRESDB_HOST}", "port": 5432, "database": "${DB_POSTGRESDB_DATABASE}", "user": "${DB_POSTGRESDB_USER}",
            "password": "${DB_POSTGRESDB_PASSWORD}", "ssl": "disable"}},
  {"id": "smtpMailpitLoc01", "name": "SMTP", "type": "smtp",
   "data": {"host": "${N8N_SMTP_HOST}", "port": ${N8N_SMTP_PORT}, "secure": false, "disableStartTls": true, "user": "${N8N_SMTP_USER:-}",
            "password": "${N8N_SMTP_PASS:-}"}}
]
JSON
n8n import:credentials --input=/tmp/credenciales.json
rm -f /tmp/credenciales.json
for f in /flujos/*.json; do
  n8n import:workflow --input="$f"
  n8n publish:workflow --id="$(sed -n 's/^  "id": "\([^"]*\)".*/\1/p' "$f")"
done
echo "n8n: credenciales y flujos importados"
