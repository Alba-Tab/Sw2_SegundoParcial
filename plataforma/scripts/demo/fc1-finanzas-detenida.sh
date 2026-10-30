#!/usr/bin/env bash
# FC1 (spec 006): con el worker de Finanzas detenido la entrega queda ENTREGADO y EntregaConfirmada espera en
# finanzas.eventos; al encenderlo hay factura, CERRADO y correo.
. "$(dirname "$0")/comun.sh"
F="$RAIZ/plataforma/scripts/fallos"
read -r S V CHOFER <<<"$(viaje_en_ruta INSUMOS 10)"
trap '"$F/encender-finanzas-worker.sh" >/dev/null 2>&1' EXIT
"$F/detener-finanzas-worker.sh"
esperado entrega "$(entregar_en_aula "$CHOFER" "$V")" ENTREGADO
sleep 3
T=$(token agroexport)
esperado "estado con Finanzas detenida" "$(servicio "$T" "$S" | json "d['estado']")" ENTREGADO
echo "  mensajes en finanzas.eventos: $(cola finanzas.eventos) (también en http://localhost:15672)"
"$F/encender-finanzas-worker.sh"
R=$(esperar "$T" "$S" "d['estado'] == 'CERRADO'" 90)
sleep 3
esperado "correo de $(echo "$R" | json "d['numeroFactura']")" "$(correos "$(echo "$R" | json "d['numeroFactura']")")" 1
