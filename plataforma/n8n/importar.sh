#!/bin/sh
# Importa las credenciales (desde el entorno, nunca del repo) y los flujos de plataforma/n8n/flujos, y los publica.
# Corre una vez antes de n8n, con su misma base y su clave de cifrado. Idempotente: reimportar reemplaza por id.
set -eu
# TLS hacia PostgreSQL (B11): la misma variable con la que n8n abre su propia base. En la nube (B1MS) es obligatorio.
PG_SSL=disable; [ "${DB_POSTGRESDB_SSL_ENABLED:-false}" = true ] && PG_SSL=require
# AMQPS en la nube (B2): AMQP_CA es la ruta a la CA propia. Sin ella, la conexión va en claro como en local.
# La credencial guarda el PEM como texto: se escapa a una línea JSON. passwordless=false entra con usuario y clave.
SSL=false; CA=
if [ -n "${AMQP_CA:-}" ]; then SSL=true; CA=$(awk '{printf "%s\\n", $0}' "$AMQP_CA"); fi
# SMTP en la nube (D37, Brevo en el 587): N8N_SMTP_STARTTLS=true sube la conexión a TLS antes de autenticarse.
# Mailpit en local no habla TLS. El remitente tiene que ser uno verificado en el proveedor.
SIN_STARTTLS=true; [ "${N8N_SMTP_STARTTLS:-false}" = true ] && SIN_STARTTLS=false
REMITENTE=${N8N_SMTP_REMITENTE:-avisos@transporte.example}
cat > /tmp/credenciales.json <<JSON
[
  {"id": "rabbitN8nLocal01", "name": "RabbitMQ n8n", "type": "rabbitmq",
   "data": {"hostname": "${AMQP_HOST}", "port": ${AMQP_PORT}, "username": "n8n", "password": "${RABBITMQ_CLAVE_N8N}", "vhost": "/",
            "ssl": ${SSL}, "passwordless": false, "ca": "${CA}"}},
  {"id": "postgresN8nLoc01", "name": "PostgreSQL n8n", "type": "postgres",
   "data": {"host": "${DB_POSTGRESDB_HOST}", "port": 5432, "database": "${DB_POSTGRESDB_DATABASE}", "user": "${DB_POSTGRESDB_USER}",
            "password": "${DB_POSTGRESDB_PASSWORD}", "ssl": "${PG_SSL}"}},
  {"id": "smtpMailpitLoc01", "name": "SMTP", "type": "smtp",
   "data": {"host": "${N8N_SMTP_HOST}", "port": ${N8N_SMTP_PORT}, "secure": false, "disableStartTls": ${SIN_STARTTLS}, "user": "${N8N_SMTP_USER:-}",
            "password": "${N8N_SMTP_PASS:-}"}}
]
JSON
n8n import:credentials --input=/tmp/credenciales.json
rm -f /tmp/credenciales.json
for f in /flujos/*.json; do
  # Los flujos guardan avisos@transporte.example como remitente; se cambia al importar, sin tocar el JSON del repo.
  sed "s|avisos@transporte.example|${REMITENTE}|" "$f" > /tmp/flujo.json
  n8n import:workflow --input=/tmp/flujo.json
  n8n publish:workflow --id="$(sed -n 's/^  "id": "\([^"]*\)".*/\1/p' "$f")"
done
rm -f /tmp/flujo.json
echo "n8n: credenciales y flujos importados"
