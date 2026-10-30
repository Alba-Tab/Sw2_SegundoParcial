#!/usr/bin/env bash
# Escenario de punta a punta por API (plan-desarrollo §4). Crece en cada hito; los pasos de interfaz se ensayan a mano.
# Antes: plataforma/scripts/reiniciar-demo.sh. Uso: plataforma/scripts/escenario-completo.sh [--nube]
#   Pasos 2-3  Agroexport cotiza el Aula (28 t de granos = 2.800,00) y la saga confirma con 4521KTR y chofer1; con
#              chofer1 ocupado, confirma también La Paz (20 t), que queda con chofer2 para el paso 7.
#   Pasos 4-5  chofer1 sale: GPS por lote, hito, frenada y la primera carga de 4521KTR (184.320 km: SIN_REFERENCIA).
#   Paso 6     Entrega en la geocerca del Aula → factura, cierre y correo.
#   Paso 7     FF2: carga exagerada (450 L con 120 km) → ANOMALIA_COMBUSTIBLE; simulador de chofer2 → RIESGO_RETRASO.
#   Pasos 8-10 (agente, voz y pago desde la interfaz) se agregan con F9 y F10.
set -euo pipefail
if [ "${1:-}" = "--nube" ]; then echo "La variante --nube llega con el despliegue (F11)." >&2; exit 2; fi
. "$(dirname "$0")/demo/comun.sh"
ANALITICA="${ANALITICA_URL:-http://localhost:8104}"
pg() { dc exec -T postgres-aws psql -U viajes -d viajes -tAc "$1"; }
carga() { # carga <token chofer> <viajeId> <litros> <kilometraje> -> código HTTP
  local cuerpo op
  op=$(uuidgen | tr '[:upper:]' '[:lower:]') # spec 009: la Idempotency-Key es el opId
  cuerpo=$(printf '{"opId":"%s","viajeId":"%s","litros":%s,"monto":{"monto":"%s","moneda":"BOB"},"kilometraje":%s,"registradaEn":"%s","posicion":{"lat":-17.75,"lng":-63.19}}' \
    "$op" "$2" "$3" "$(python3 -c "print(f'{$3 * 3.74:.2f}')")" "$4" "$(date -u +%FT%TZ)")
  curl -s -o /tmp/carga.json -w '%{http_code}' -X POST "$FLOTA/api/v1/cargas-combustible" -H "Authorization: Bearer $1" \
    -H "Idempotency-Key: $op" -H 'Content-Type: application/json' -d "$cuerpo"
}
alertas_de() { # alertas_de <usuario> <tipo> -> cuántas ABIERTA de ese tipo ve
  curl -sf "$ANALITICA/api/v1/alertas?estado=ABIERTA&limite=100" -H "Authorization: Bearer $(token "$1")" \
    | json "str(sum(1 for a in d['alertas'] if a['tipo'] == '$2'))"
}
esperar_que() { # esperar_que <descripción> <comando> <esperado> [segundos]
  local fin=$((SECONDS + ${4:-60})) real
  while [ $SECONDS -lt $fin ]; do real=$(eval "$2" || true); [ "$real" = "$3" ] && break; sleep 3; done
  esperado "$1" "$real" "$3"
}

paso "Pasos 2 y 3: Agroexport cotiza y confirma el Aula"
T=$(token agroexport)
S=$(confirmar "$T" "$(cotizar "$T" $AULA GRANOS 28)" | json "d['servicioId']")
R=$(esperar "$T" "$S" "d['confirmacionCompleta']" 60)
esperado estado "$(echo "$R" | json "d['estado']")" CONFIRMADO
esperado placa "$(echo "$R" | json "d['placa']")" 4521KTR
esperado monto "$(echo "$R" | json "d['monto']['monto']")" 2800.00
V=$(echo "$R" | json "d['viajeId']")
esperado chofer "$(usuario_chofer "$(echo "$R" | json "d['choferNombre']")")" chofer1
# El viaje del paso 7 se confirma ahora, con chofer1 ocupado: así la saga asigna a chofer2 (T8.7).
S2=$(confirmar "$T" "$(cotizar "$T" $LA_PAZ GRANOS 20)" | json "d['servicioId']")
R2=$(esperar "$T" "$S2" "d['confirmacionCompleta']" 60)
esperado "segundo viaje (La Paz)" "$(echo "$R2" | json "d['estado']") $(usuario_chofer "$(echo "$R2" | json "d['choferNombre']")")" "CONFIRMADO chofer2"

paso "Pasos 4 y 5: chofer1 sale, sincroniza y carga diésel"
C=$(token chofer1); CELULAR=$(uuidgen | tr '[:upper:]' '[:lower:]')
B="{\"dispositivoId\":\"$CELULAR\",\"plataforma\":\"IOS\"}"
curl -sf -o /dev/null -X PUT "$VIAJES/api/v1/dispositivos/mio" -H "Authorization: Bearer $C" -H 'Content-Type: application/json' -d "$B"
B="{\"dispositivoId\":\"$CELULAR\",\"iniciadoEn\":\"$(date -u -v-2H +%FT%TZ 2>/dev/null || date -u -d '-2 hours' +%FT%TZ)\"}"
esperado inicio "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$VIAJES/api/v1/viajes/$V/inicio" -H "Authorization: Bearer $C" \
  -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' -d "$B")" 200
L=$(python3 -c "
import json,datetime as d
a=d.datetime.now(d.timezone.utc).replace(microsecond=0)
print(json.dumps({'dispositivoId':'$CELULAR','puntos':[{'seq':i,'registradaEn':(a-d.timedelta(minutes=60-i)).isoformat().replace('+00:00','Z'),'lat':-17.7833+i*0.0001,'lng':-63.1821-i*0.0002,'velocidadKmh':50,'precisionMetros':5} for i in range(0,60,2)]}))")
esperado "lote de GPS" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$VIAJES/api/v1/viajes/$V/gps/lotes" -H "Authorization: Bearer $C" \
  -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' -d "$L")" 200
H="{\"hitoId\":\"$(uuidgen | tr '[:upper:]' '[:lower:]')\",\"tipo\":\"PUNTO_CONTROL\",\"descripcion\":\"Control de la ABC en la salida\",\"posicion\":{\"lat\":-17.78,\"lng\":-63.19},\"registradoEn\":\"$(date -u +%FT%TZ)\",\"origen\":\"VOZ\"}"
esperado hito "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$VIAJES/api/v1/viajes/$V/hitos" -H "Authorization: Bearer $C" \
  -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' -d "$H")" 200
F="{\"eventoId\":\"$(uuidgen | tr '[:upper:]' '[:lower:]')\",\"tipo\":\"FRENADA_BRUSCA\",\"magnitudG\":0.48,\"posicion\":{\"lat\":-17.78,\"lng\":-63.19},\"registradoEn\":\"$(date -u +%FT%TZ)\"}"
esperado frenada "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$VIAJES/api/v1/viajes/$V/eventos-conduccion" -H "Authorization: Bearer $C" \
  -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' -d "$F")" 200
esperado "carga 184.320 km (primera del tracto)" "$(carga "$C" "$V" 180.5 184320)" 201

paso "Paso 6: entrega en el Aula → factura, cierre y correo"
CORREOS=$(correos 'Factura')
esperado entrega "$(entregar_en_aula chofer1 "$V")" ENTREGADO
esperar_que "viaje CERRADO (factura emitida)" "pg \"SELECT estado FROM viaje WHERE viaje_id = '$V'\"" CERRADO 90
esperar_que "correo de la factura" "correos 'Factura'" "$((CORREOS + 1))" 60

paso "Paso 7: anomalía de diésel (FF2) y retraso del viaje de chofer2"
esperado "carga exagerada 450 L a 184.440 km" "$(carga "$C" "$V" 450 184440)" 201
esperar_que "ANOMALIA_COMBUSTIBLE para el jefe de flota" "alertas_de jefeflota1 ANOMALIA_COMBUSTIBLE" 1 60
esperado "el despachador no la ve" "$(alertas_de despachador1 ANOMALIA_COMBUSTIBLE)" 0
python3 "$RAIZ/plataforma/simulador-viaje/simular.py" ${BITACORA_MALICIOSA:+--bitacora-maliciosa}

echo; echo "✔ Escenario hasta el paso 7 en verde."
