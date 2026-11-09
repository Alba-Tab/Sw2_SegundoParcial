#!/usr/bin/env bash
# Spec 005 por la API (T7.1): un viaje en ruta recibe dos lotes de GPS (uno reenviado), un hito dos veces y una frenada.
# Verifica un PosicionActualizada por lote que avanzó, un HitoRegistrado, el cursor del celular y el recorrido (FO1 sin app).
. "$(dirname "$0")/comun.sh"
read -r S V CHOFER <<< "$(viaje_en_ruta INSUMOS 20)"
C=$(token "$CHOFER"); D=$(token despachador1)
CELULAR=$(uuidgen | tr '[:upper:]' '[:lower:]')
pg() { dc exec -T postgres-aws psql -U viajes -d viajes -tAc "$1"; }
eventos() { pg "SELECT count(*) FROM outbox_eventos WHERE tipo = '$1' AND sobre->'datos'->>'viajeId' = '$V'"; }
api() { # api <método> <ruta> <clave|-> [cuerpo] -> código HTTP (cuerpo en /tmp/ruta.json)
  local extra=(); [ "$3" != - ] && extra=(-H "Idempotency-Key: $3"); [ -n "${4:-}" ] && extra+=(--data-binary "$4")
  curl -s -o /tmp/ruta.json -w '%{http_code}' -X "$1" "$VIAJES$2" -H "Authorization: Bearer ${TOKEN:-$C}" \
    -H 'Content-Type: application/json' ${extra[@]+"${extra[@]}"}
}
lote() { # lote <desde> <hasta> <segundos antes de ahora>: puntos cada 10 s
  python3 -c "
import json,sys,datetime as d
a,b=int(sys.argv[1]),int(sys.argv[2]); ahora=d.datetime.now(d.timezone.utc).replace(microsecond=0)-d.timedelta(seconds=int(sys.argv[4]))
p=[{'seq':i,'registradaEn':(ahora-d.timedelta(seconds=10*(b-i))).isoformat().replace('+00:00','Z'),'lat':-17.70-i/2000,'lng':-63.18,'velocidadKmh':55,'precisionMetros':5} for i in range(a,b+1)]
print(json.dumps({'dispositivoId':sys.argv[3],'puntos':p}))" "$1" "$2" "$CELULAR" "$3"
}

# Los cuerpos van en variables: bash 3.2 (macOS) parte mal las comillas escapadas dentro de "$(…)".
paso "Celular y primer lote (viaje $V, $CHOFER)"
B="{\"dispositivoId\":\"$CELULAR\",\"plataforma\":\"IOS\"}"
esperado "dispositivo" "$(api PUT /api/v1/dispositivos/mio - "$B")" 200
L1=$(lote 0 29 300); L2=$(lote 30 44 0); K1=$(uuidgen)
esperado "lote 1" "$(api POST "/api/v1/viajes/$V/gps/lotes" "$K1" "$L1") $(json "str(d['ultimaPosicionActualizada'])" < /tmp/ruta.json)" "200 True"
esperado "lote 1 reenviado" "$(api POST "/api/v1/viajes/$V/gps/lotes" "$K1" "$L1") $(json "str(d['ultimaPosicionActualizada'])" < /tmp/ruta.json)" "200 False"
esperado "lote 2" "$(api POST "/api/v1/viajes/$V/gps/lotes" "$(uuidgen)" "$L2") $(json "str(d['ultimaSecuencia'])" < /tmp/ruta.json)" "200 44"
esperado "PosicionActualizada (uno por lote que avanzó)" "$(eventos PosicionActualizada)" 2

paso "Bitácora"
H="{\"hitoId\":\"$(uuidgen | tr '[:upper:]' '[:lower:]')\",\"tipo\":\"BLOQUEO\",\"descripcion\":\"Bloqueo en el puente, tránsito detenido\",\"posicion\":{\"lat\":-17.71,\"lng\":-63.18},\"registradoEn\":\"$(date -u +%FT%TZ)\",\"origen\":\"VOZ\"}"
KH=$(uuidgen)
esperado "hito" "$(api POST "/api/v1/viajes/$V/hitos" "$KH" "$H")" 200
esperado "hito reenviado" "$(api POST "/api/v1/viajes/$V/hitos" "$KH" "$H")" 200
F="{\"eventoId\":\"$(uuidgen | tr '[:upper:]' '[:lower:]')\",\"tipo\":\"FRENADA_BRUSCA\",\"magnitudG\":0.52,\"posicion\":{\"lat\":-17.71,\"lng\":-63.18},\"registradoEn\":\"$(date -u +%FT%TZ)\"}"
esperado "frenada" "$(api POST "/api/v1/viajes/$V/eventos-conduccion" "$(uuidgen)" "$F")" 200
esperado "HitoRegistrado" "$(eventos HitoRegistrado)" 1
esperado "EventoConduccionRegistrado" "$(eventos EventoConduccionRegistrado)" 1

paso "Cursor, recorrido y mapa"
esperado "cursor del celular" "$(api GET "/api/v1/dispositivos/$CELULAR/cursor?viajeId=$V" -) $(json "str(d['ultimaSecuencia'])" < /tmp/ruta.json)" "200 44"
TOKEN=$D
esperado "recorrido" "$(api GET "/api/v1/viajes/$V/recorrido" -) $(json "str(len(d['items']))" < /tmp/ruta.json)" "200 45"
esperado "mapa en vivo" "$(api GET "/api/v1/viajes?estado=EN_RUTA&limite=100" -) $(json "str(any(i['viajeId'] == '$V' and 'ultimaPosicion' in i for i in d['items']))" < /tmp/ruta.json)" "200 True"
# Se entrega en el Aula para devolver la unidad y el chofer (cancelar en ruta no se permite).
esperado "entrega para liberar la unidad" "$(entregar_en_aula "$CHOFER" "$V")" ENTREGADO
