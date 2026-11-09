#!/usr/bin/env bash
# FS3 (spec 012): "Agro Moroso" (factura vencida hace 20 días) confirma La Paz con 20 t y espera aprobación.
# Uso: saga-mora.sh [aprobar|rechazar|vencer]   (vencer espera SAGA_ESPERA_APROBACION, PT3M con .env.demo)
. "$(dirname "$0")/comun.sh"
DECISION=${1:-aprobar}
T=$(token agromoroso); A=$(token administracion1)
ANTES=$(disponible "$A" $AGRO_MOROSO)   # 25000.00 con la semilla recién cargada
COT=$(cotizar "$T" $LA_PAZ GRANOS 20)
S=$(confirmar "$T" "$COT" | json "d['servicioId']")
esperar "$T" "$S" "d.get('etapa') == 'ESPERANDO_APROBACION'" 30 >/dev/null
esperado "disponible en espera (bajó 7.600)" "$(disponible "$A" $AGRO_MOROSO)" "$(python3 -c "print(f'{float(\"$ANTES\") - 7600:.2f}')")"
curl -sf "$FINANZAS/api/v1/solicitudes-aprobacion/$S" -H "Authorization: Bearer $A" | json "'  solicitud ' + d['estado'] + ' por ' + ','.join(d['motivos'])"
decidir() {
  curl -s -o /dev/null -w '%{http_code}' -X POST "$VIAJES/api/v1/servicios/$S/aprobacion-credito" -H "Authorization: Bearer $A" \
    -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' -d "$1"
}
case "$DECISION" in
  aprobar)
    esperado "decisión" "$(decidir '{"aprobado":true}')" 202
    R=$(esperar "$T" "$S" "d['confirmacionCompleta']" 30)
    esperado estado "$(echo "$R" | json "d['estado']")" CONFIRMADO ;;
  rechazar)
    esperado "decisión" "$(decidir '{"aprobado":false,"motivo":"Mora de 20 días"}')" 202
    R=$(esperar "$T" "$S" "d['estado'] == 'CANCELADO'" 30)
    esperado motivo "$(echo "$R" | json "d['motivo']")" CREDITO_RECHAZADO
    esperado "disponible (volvió)" "$(disponible "$A" $AGRO_MOROSO)" "$ANTES" ;;
  vencer)
    R=$(esperar "$T" "$S" "d['estado'] == 'CANCELADO'" 600)
    esperado motivo "$(echo "$R" | json "d['motivo']")" APROBACION_VENCIDA ;;
esac
