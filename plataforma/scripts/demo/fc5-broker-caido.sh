#!/usr/bin/env bash
# FC5 (spec 006, solo local): con RabbitMQ detenido la entrega responde 200 y el evento queda en outbox_eventos sin
# publicar; al volver el broker, el relay lo publica y sigue la coreografía hasta CERRADO. Además, cada servicio vuelve
# a consumir su cola (sin eso, alertas, riesgo y reportes quedarían congelados sin aviso).
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
for q in viajes finanzas flota analitica n8n; do
  fin=$((SECONDS + 60))
  while [ "$(consumidores "$q.eventos")" = 0 ] && [ $SECONDS -lt $fin ]; do sleep 3; done
  esperado "$q.eventos vuelve a tener consumidor" "$([ "$(consumidores "$q.eventos")" -gt 0 ] && echo sí || echo no)" sí
done
