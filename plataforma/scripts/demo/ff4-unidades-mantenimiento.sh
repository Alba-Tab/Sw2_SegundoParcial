#!/usr/bin/env bash
# FF4 y la sección E de la spec 010 por la API: el jefe de flota da de alta una cisterna y un furgón con atributos
# distintos (un furgón con compartimentos es 400), programa y cierra un PREVENTIVO y, al final, da de baja las dos.
. "$(dirname "$0")/comun.sh"
FLOTA="${FLOTA_URL:-http://localhost:8102}"
J=$(token jefeflota1); D=$(token despachador1)
SUFIJO=$(printf '%03d' $((RANDOM % 1000)))
flota() { # flota <token> <método> <ruta> [cuerpo] -> código HTTP (cuerpo en /tmp/flota.json)
  local cuerpo=(); [ -n "${4:-}" ] && cuerpo=(--data-binary "$4")
  curl -s -o /tmp/flota.json -w '%{http_code}' -X "$2" "$FLOTA$3" -H "Authorization: Bearer $1" \
    -H "Idempotency-Key: $(uuidgen | tr '[:upper:]' '[:lower:]')" -H 'Content-Type: application/json' ${cuerpo[@]+"${cuerpo[@]}"}
}
docs="[{\"tipo\":\"SOAT\",\"venceEl\":\"$(TZ=America/La_Paz date -v+200d +%F)\"},{\"tipo\":\"INSPECCION_TECNICA\",\"venceEl\":\"$(TZ=America/La_Paz date -v+200d +%F)\"}]"

# Los cuerpos van en variables: bash 3.2 (macOS) parte mal las comillas escapadas dentro de "$(…)".
remolque() { # remolque <placa> <tipoRemolque> <km> <atributos>
  echo "{\"tipoUnidad\":\"REMOLQUE\",\"placa\":\"$1\",\"tipoRemolque\":\"$2\",\"capacidadToneladas\":28,\"kmDesdeUltimoMantenimiento\":$3,\"documentos\":$docs,\"atributos\":$4}"
}

paso "FF4: atributos por tipo"
B=$(remolque "9${SUFIJO}CIS" CISTERNA 0 '{"compartimentos":3,"capacidadLitros":30000}')
esperado "cisterna" "$(flota "$J" POST /api/v1/unidades "$B")" 201
CISTERNA=$(json "d['unidadId']" < /tmp/flota.json)
B=$(remolque "9${SUFIJO}FUR" FURGON 10000 '{"volumenM3":85}')
esperado "furgón con 10.000 km" "$(flota "$J" POST /api/v1/unidades "$B")" 201
FURGON=$(json "d['unidadId']" < /tmp/flota.json)
esperado "nace" "$(json "d['estado']" < /tmp/flota.json)" MANTENIMIENTO_PENDIENTE
B=$(remolque "8${SUFIJO}FUR" FURGON 0 '{"volumenM3":85,"compartimentos":3}')
esperado "furgón con compartimentos" "$(flota "$J" POST /api/v1/unidades "$B") $(json "d['errores'][0]['campo']" < /tmp/flota.json)" "400 atributos.compartimentos"
esperado "GET de la cisterna" "$(flota "$J" GET "/api/v1/unidades/$CISTERNA") $(json "sorted(d['atributos'])" < /tmp/flota.json)" "200 ['capacidadLitros', 'compartimentos']"
B="{\"kilometraje\":5,\"capacidadToneladas\":28,\"documentos\":$docs,\"atributos\":{\"compartimentos\":3,\"capacidadLitros\":30000}}"
esperado "PUT con kilometraje" "$(flota "$J" PUT "/api/v1/unidades/$CISTERNA" "$B")" 400

paso "Programar y cerrar un PREVENTIVO (spec 010, E)"
M="{\"tipo\":\"PREVENTIVO\",\"fechaProgramada\":\"$(hoy)\",\"taller\":\"Taller Norte\",\"descripcion\":\"Revisión de 10.000 km\",\"checklist\":[{\"item\":\"Frenos\"},{\"item\":\"Luces\"}]}"
esperado "despachador" "$(flota "$D" POST "/api/v1/unidades/$FURGON/mantenimientos" "$M")" 403
esperado "programado" "$(flota "$J" POST "/api/v1/unidades/$FURGON/mantenimientos" "$M")" 201
MANT=$(json "d['mantenimientoId']" < /tmp/flota.json)
esperado "furgón" "$(flota "$J" GET "/api/v1/unidades/$FURGON") $(json "d['estado']" < /tmp/flota.json)" "200 EN_MANTENIMIENTO"
FALLA='{"checklist":[{"item":"Frenos","ok":true},{"item":"Luces","ok":false}]}'
esperado "cierre con Luces sin terminar" "$(flota "$J" POST "/api/v1/mantenimientos/$MANT/cierre" "$FALLA")" 400
OK='{"checklist":[{"item":"Frenos","ok":true},{"item":"Luces","ok":true}],"observaciones":"Sin novedad"}'
esperado "cierre" "$(flota "$J" POST "/api/v1/mantenimientos/$MANT/cierre" "$OK")" 200
esperado "furgón" "$(flota "$J" GET "/api/v1/unidades/$FURGON") $(json "d['estado'] + ' ' + str(d['kmDesdeUltimoMantenimiento'])" < /tmp/flota.json)" "200 DISPONIBLE 0"
esperado "en la lista" "$(flota "$J" GET "/api/v1/mantenimientos?unidadId=$FURGON") $(json "d['items'][0]['estado']" < /tmp/flota.json)" "200 CERRADO"

paso "Baja de las unidades de prueba (INACTIVA no se reserva)"
BAJA='{"motivo":"Unidad de prueba de ff4"}'
for u in "$CISTERNA" "$FURGON"; do
  esperado "baja" "$(flota "$J" POST "/api/v1/unidades/$u/baja" "$BAJA") $(json "d['estado']" < /tmp/flota.json)" "200 INACTIVA"
done
