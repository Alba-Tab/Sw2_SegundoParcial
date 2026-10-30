#!/usr/bin/env bash
# FC2 (spec 006): republicar el último FacturaEmitida ya procesado no manda otro correo ni cambia el viaje.
. "$(dirname "$0")/comun.sh"
fila=$(dc exec -T postgres-azure psql -U finanzas -d finanzas -tAc \
  "SELECT id || ' ' || (sobre->'datos'->>'numero') FROM outbox_eventos WHERE tipo = 'FacturaEmitida' AND publicado_en IS NOT NULL ORDER BY creado_en DESC LIMIT 1")
[ -z "$fila" ] && { echo "Primero corre entrega-feliz.sh o fc1-finanzas-detenida.sh"; exit 1; }
read -r E NUM <<<"$fila"
ANTES=$(correos "$NUM")
"$RAIZ/plataforma/scripts/fallos/republicar-evento.sh" "$E"
sleep 5
esperado "correos de $NUM" "$(correos "$NUM")" "$ANTES"
