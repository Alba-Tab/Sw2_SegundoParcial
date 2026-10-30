#!/usr/bin/env bash
# FS2: atención comercial confirma por "Ferretería Sin Crédito" (límite 5.000) La Paz con 20 t (7.600).
. "$(dirname "$0")/comun.sh"
T=$(token comercial1)
COT=$(cotizar "$T" $LA_PAZ GRANOS 20 $FERRETERIA)
S=$(confirmar "$T" "$COT" $FERRETERIA | json "d['servicioId']")
R=$(esperar "$T" "$S" "d['estado'] == 'CANCELADO'" 30)
esperado motivo "$(echo "$R" | json "d['motivo']")" CREDITO_INSUFICIENTE
esperado "disponible de Ferretería" "$(disponible "$(token administracion1)" $FERRETERIA)" 5000.00
