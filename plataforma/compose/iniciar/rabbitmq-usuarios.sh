#!/usr/bin/env bash
# Carga la topología y crea un usuario por servicio con permisos mínimos sobre transporte.events y su propia cola (000, D73).
set -eu
api() { curl -sf -u "$RABBITMQ_ADMIN:$RABBITMQ_ADMIN_CLAVE" -H 'content-type: application/json' "http://rabbitmq:15672/api/$1" "${@:2}" >/dev/null; }
until curl -sf -u "$RABBITMQ_ADMIN:$RABBITMQ_ADMIN_CLAVE" http://rabbitmq:15672/api/overview >/dev/null; do sleep 2; done
# Topología del contrato (contratos/eventos/README.md): exchanges, colas quorum con DLQ y bindings. Idempotente.
api definitions -X POST --data-binary @/rabbitmq/definitions.json
echo "topología cargada"
usuario() { # nombre clave configure write read
  api "users/$1" -X PUT -d "$(jq -nc --arg p "$2" '{password: $p, tags: ""}')"
  api "permissions/%2F/$1" -X PUT -d "$(jq -nc --arg c "$3" --arg w "$4" --arg r "$5" '{configure: $c, write: $w, read: $r}')"
  echo "usuario $1"
}
for s in viajes finanzas flota analitica n8n; do
  clave=$(printenv "RABBITMQ_CLAVE_$(echo $s | tr '[:lower:]' '[:upper:]')")
  usuario "$s" "$clave" "^$" "^transporte\\.events$" "^$s\\.(eventos|sensor)(\\.dlq)?$"
  # Cada productor publica solo sus propias claves de enrutamiento (<servicio>.*); n8n solo consume.
  escribe="^$s\\..+"; [ "$s" = n8n ] && escribe="^$"
  api "topic-permissions/%2F/$s" -X PUT -d "$(jq -nc --arg w "$escribe" '{exchange: "transporte.events", write: $w, read: ".*"}')"
done
# D73: el simulador solo publica en camion.*.combustible por MQTT.
usuario sensor-sim "$RABBITMQ_CLAVE_SENSOR" "^(amq\\.topic|mqtt-subscription-.*)$" "^amq\\.topic$" "^(amq\\.topic|mqtt-subscription-.*)$"
api "topic-permissions/%2F/sensor-sim" -X PUT -d "$(jq -nc '{exchange: "amq.topic", write: "^camion\\.[^.]+\\.combustible$", read: "^$"}')"
echo "permisos de RabbitMQ listos"
