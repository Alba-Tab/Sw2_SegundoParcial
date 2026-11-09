#!/usr/bin/env bash
# FC2 (local): vuelve a publicar un evento ya publicado, tal cual salió del Outbox de su productor (Viajes, Finanzas o
# Flota), con su mismo eventId. Los consumidores lo descartan por su Inbox. Uso: republicar-evento.sh <eventId>
set -euo pipefail
. "$(dirname "$0")/../demo/comun.sh"
E=$1
fila=$(dc exec -T postgres-aws psql -U viajes -d viajes -tAc "SELECT clave_enrutamiento || '|' || sobre::text FROM outbox_eventos WHERE id = '$E'")
[ -z "$fila" ] && fila=$(dc exec -T postgres-azure psql -U finanzas -d finanzas -tAc "SELECT clave_enrutamiento || '|' || sobre::text FROM outbox_eventos WHERE id = '$E'")
[ -z "$fila" ] && fila=$(dc exec -T mongo mongosh -quiet flota --eval "const f = db.outboxEventos.findOne({_id: '$E'}); if (f) print(f.claveEnrutamiento + '|' + JSON.stringify(f.sobre))")
[ -z "$fila" ] && { echo "No encontré el evento $E en ningún Outbox" >&2; exit 1; }
echo "republicado ($(publicar "${fila%%|*}" "${fila#*|}")): ${fila%%|*} $E"
