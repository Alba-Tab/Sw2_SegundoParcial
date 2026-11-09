#!/usr/bin/env bash
# FS1: con COTIZACION_VIGENCIA=PT2M (.env.demo) una cotización de hace más de 2 minutos termina CANCELADO con
# COTIZACION_VENCIDA, sin reserva de crédito ni de unidad.
. "$(dirname "$0")/comun.sh"
T=$(token agroexport); A=$(token administracion1)
ANTES=$(disponible "$A" $AGROEXPORT)
COT=$(cotizar "$T" $AULA GRANOS 10)
paso "Esperando ${ESPERA:-130} s a que venza"; sleep "${ESPERA:-130}"
S=$(confirmar "$T" "$COT" | json "d['servicioId']")
R=$(esperar "$T" "$S" "d['estado'] == 'CANCELADO'" 30)
esperado motivo "$(echo "$R" | json "d['motivo']")" COTIZACION_VENCIDA
esperado disponible "$(disponible "$A" $AGROEXPORT)" "$ANTES"
