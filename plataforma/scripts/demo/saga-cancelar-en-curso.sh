#!/usr/bin/env bash
# FS9 (D17): cancelar un servicio que todavía se está programando responde 409 CONFIRMACION_EN_CURSO. Usa "Agro Moroso"
# porque su servicio queda esperando aprobación; al final lo rechaza para no dejarlo abierto.
. "$(dirname "$0")/comun.sh"
T=$(token agromoroso); A=$(token administracion1)
COT=$(cotizar "$T" $LA_PAZ GRANOS 20)
S=$(confirmar "$T" "$COT" | json "d['servicioId']")
esperar "$T" "$S" "d.get('etapa') == 'ESPERANDO_APROBACION'" 30 >/dev/null
R=$(curl -s -X POST "$VIAJES/api/v1/servicios/$S/cancelacion" -H "Authorization: Bearer $T" -H "Idempotency-Key: $(uuidgen)" \
  -H 'Content-Type: application/json' -d '{"motivo":"Ya no lo necesito"}')
esperado codigo "$(echo "$R" | json "d['codigo']")" CONFIRMACION_EN_CURSO
curl -sf -o /dev/null -X POST "$VIAJES/api/v1/servicios/$S/aprobacion-credito" -H "Authorization: Bearer $A" \
  -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' -d '{"aprobado":false,"motivo":"Prueba FS9"}'
