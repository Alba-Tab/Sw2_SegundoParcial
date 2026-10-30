#!/usr/bin/env bash
# FS7 (D43): dos POST /servicios simultáneos con la misma clave y el mismo cuerpo → dos 202 con el mismo servicioId.
. "$(dirname "$0")/comun.sh"
T=$(token agroexport)
COT=$(cotizar "$T" $AULA GRANOS 10)
CLAVE=$(uuidgen)
confirmar "$T" "$COT" "" "$CLAVE" > /tmp/fs7-a.json & confirmar "$T" "$COT" "" "$CLAVE" > /tmp/fs7-b.json & wait
A=$(json "d['servicioId']" < /tmp/fs7-a.json); B=$(json "d['servicioId']" < /tmp/fs7-b.json)
esperado "mismo servicioId" "$A" "$B"
esperar "$T" "$A" "d['confirmacionCompleta']" 30 >/dev/null
esperado "workflows de ese servicio" "$(dc exec -T postgres-aws psql -U viajes -d viajes -tAc "SELECT count(*) FROM servicio WHERE cotizacion_id = '$COT'")" 1
liberar "$A"
