#!/usr/bin/env bash
# FC3 (spec 006, solo local): un EntregaConfirmada sin viajeId termina en finanzas.eventos.dlq y no se factura.
. "$(dirname "$0")/comun.sh"
ANTES=$(cola finanzas.eventos.dlq)
publicar viajes.entrega-confirmada.v1 "{\"id\":\"$(uuidgen | tr '[:upper:]' '[:lower:]')\",\"tipo\":\"EntregaConfirmada\",\"version\":1,\"datos\":{\"servicioId\":\"$(uuidgen)\"}}" >/dev/null
for _ in $(seq 1 10); do [ "$(cola finanzas.eventos.dlq)" -gt "$ANTES" ] && break; sleep 2; done
esperado "mensajes nuevos en finanzas.eventos.dlq" "$(( $(cola finanzas.eventos.dlq) - ANTES ))" 1
