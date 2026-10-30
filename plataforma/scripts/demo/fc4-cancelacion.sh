#!/usr/bin/env bash
# FC4 (spec 004): cancelar un servicio CONFIRMADO libera el crédito (Finanzas) y la unidad (Flota) por coreografía.
. "$(dirname "$0")/comun.sh"
T=$(token agroexport); A=$(token administracion1); J=$(token jefeflota1)
ANTES=$(disponible "$A" $AGROEXPORT)
S=$(confirmar "$T" "$(cotizar "$T" $AULA INSUMOS 10)" | json "d['servicioId']")
esperar "$T" "$S" "d['confirmacionCompleta']" 30 >/dev/null
TRACTO=$(dc exec -T mongo mongosh -quiet flota --eval "print(db.reservasUnidad.findOne({servicioId: '$S'}).tractoId)")
esperado "cancelación" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$VIAJES/api/v1/servicios/$S/cancelacion" -H "Authorization: Bearer $T" \
  -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' -d '{"motivo":"Cambio de fecha de cosecha"}')" 200
sleep 4
esperado "disponible de Agroexport" "$(disponible "$A" $AGROEXPORT)" "$ANTES"
esperado "tracto" "$(curl -sf "$FLOTA/api/v1/unidades/$TRACTO" -H "Authorization: Bearer $J" | json "d['estado']")" DISPONIBLE
