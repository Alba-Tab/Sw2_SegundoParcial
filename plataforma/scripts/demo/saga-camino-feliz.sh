#!/usr/bin/env bash
# Paso 3 del escenario (spec 003): Agroexport confirma el Aula con 28 t de granos (2.800,00) y llega a CONFIRMADO.
. "$(dirname "$0")/comun.sh"
T=$(token agroexport)
paso "Cotiza el Aula, 28 t de granos"
COT=$(cotizar "$T" $AULA GRANOS 28)
paso "Confirma"
S=$(confirmar "$T" "$COT" | json "d['servicioId']")
R=$(esperar "$T" "$S" "d['confirmacionCompleta']" 30)
esperado estado "$(echo "$R" | json "d['estado']")" CONFIRMADO
esperado placa "$(echo "$R" | json "d['placa']")" 4521KTR
esperado monto "$(echo "$R" | json "d['monto']['monto']")" 2800.00
echo "servicioId=$S"
