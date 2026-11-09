#!/usr/bin/env bash
# FC5 (local): enciende RabbitMQ. Viajes, Finanzas y Flota reconectan solos. El disparador de RabbitMQ de n8n no se
# reconecta después de una caída del broker y n8n despublica el flujo, así que se vuelve a publicar con el importador y
# se reinicia n8n (los mensajes esperan en n8n.eventos, que es quorum).
C="docker compose -f $(dirname "$0")/../../compose/compose.yaml --profile core --profile plataforma"
$C start rabbitmq
until $C exec -T rabbitmq rabbitmq-diagnostics -q check_port_connectivity >/dev/null 2>&1; do sleep 2; done
$C run --rm n8n-importar >/dev/null
$C restart n8n
