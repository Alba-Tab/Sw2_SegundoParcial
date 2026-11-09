#!/usr/bin/env bash
# FS5: con el worker de Flota apagado la saga espera en RESERVANDO_UNIDAD y sigue al encenderlo.
# FS6 (--reiniciar-viajes): además se detiene Viajes a la mitad; el workflow retoma sin duplicar el viaje.
. "$(dirname "$0")/comun.sh"
F="$RAIZ/plataforma/scripts/fallos"
T=$(token agroexport)
COT=$(cotizar "$T" $AULA GRANOS 10)
"$F/apagar-worker-flota.sh"
S=$(confirmar "$T" "$COT" | json "d['servicioId']")
esperar "$T" "$S" "d.get('etapa') == 'RESERVANDO_UNIDAD'" 30 >/dev/null
paso "Esperando ${ESPERA:-60} s con el worker apagado"; sleep "${ESPERA:-60}"
if [ "${1:-}" = "--reiniciar-viajes" ]; then
  "$F/detener-viajes.sh"; "$F/encender-worker-flota.sh"; sleep 5; dc start viajes
  until curl -sf "$VIAJES/health" >/dev/null; do sleep 2; done
else
  "$F/encender-worker-flota.sh"
fi
R=$(esperar "$T" "$S" "d['confirmacionCompleta']" 90)
esperado estado "$(echo "$R" | json "d['estado']")" CONFIRMADO
esperado "viajes del servicio" "$(dc exec -T postgres-aws psql -U viajes -d viajes -tAc "SELECT count(*) FROM viaje WHERE servicio_id = '$S'")" 1
liberar "$S"
