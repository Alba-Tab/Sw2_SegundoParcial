#!/usr/bin/env bash
# FC5 (spec 006, solo local): con RabbitMQ detenido la entrega responde 200 y el evento queda en outbox_eventos sin
# publicar; al volver el broker, el relay lo publica y sigue la coreografía hasta CERRADO.
. "$(dirname "$0")/comun.sh"
F="$RAIZ/plataforma/scripts/fallos"
read -r S V CHOFER <<<"$(viaje_en_ruta INSUMOS 10)"
C=$(token "$CHOFER"); IMG=$(png_de_prueba)
FOTO=$(subir_evidencia "$C" "$V" FOTO_ENTREGA "$IMG"); FIRMA=$(subir_evidencia "$C" "$V" FIRMA "$IMG")
trap '"$F/encender-rabbitmq.sh" >/dev/null 2>&1' EXIT
"$F/detener-rabbitmq.sh"
esperado "entrega sin broker" "$(registrar_entrega "$C" "$V" "$FOTO" "$FIRMA")" 200
esperado "EntregaConfirmada sin publicar" "$(dc exec -T postgres-aws psql -U viajes -d viajes -tAc \
  "SELECT count(*) FROM outbox_eventos WHERE tipo = 'EntregaConfirmada' AND publicado_en IS NULL AND sobre->'datos'->>'viajeId' = '$V'")" 1
"$F/encender-rabbitmq.sh"
esperar "$(token agroexport)" "$S" "d['estado'] == 'CERRADO'" 120 | json "'  ✔ ' + d['estado'] + ' con ' + d['numeroFactura']"
