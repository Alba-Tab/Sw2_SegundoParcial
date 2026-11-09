#!/usr/bin/env bash
# Pasos 3 a 6 del escenario por curl (H5): confirma el Aula, chofer1 inicia, sube foto y firma por partes (S3 firmado),
# entrega dentro de la geocerca y espera la coreografía: factura (Finanzas), furgón liberado con km (Flota, FF3),
# viaje CERRADO (Viajes) y correo (n8n en Mailpit).
. "$(dirname "$0")/comun.sh"
T=$(token agroexport); C=$(token chofer1); A=$(token administracion1); J=$(token jefeflota1)
paso "Confirma el Aula, 28 t"
COT=$(cotizar "$T" $AULA GRANOS 28)
S=$(confirmar "$T" "$COT" | json "d['servicioId']")
V=$(esperar "$T" "$S" "d['confirmacionCompleta']" 30 | json "d['viajeId']")
paso "chofer1 ve su viaje y lo inicia"
esperado "viaje en sus viajes" "$(curl -sf "$VIAJES/api/v1/viajes/mios" -H "Authorization: Bearer $C" | json "str(any(i['viajeId'] == '$V' for i in d['items']))")" True
curl -sf -o /dev/null -X POST "$VIAJES/api/v1/viajes/$V/inicio" -H "Authorization: Bearer $C" -H "Idempotency-Key: $(uuidgen)" \
  -H 'Content-Type: application/json' -d "{\"dispositivoId\":\"$(uuidgen)\",\"iniciadoEn\":\"$(date -u +%FT%TZ)\"}"
sleep 2
esperado "tracto en Flota" "$(curl -sf "${FLOTA_URL:-http://localhost:8102}/api/v1/unidades/01933c00-0000-7000-8000-000000000001" -H "Authorization: Bearer $J" | json "d['estado']")" EN_VIAJE
paso "Sube foto y firma por partes y entrega en el Aula"
IMG=$(mktemp); python3 -c "import sys; sys.stdout.buffer.write(b'\x89PNG\r\n\x1a\n' + bytes(2048))" > "$IMG"
FOTO=$(subir_evidencia "$C" "$V" FOTO_ENTREGA "$IMG"); FIRMA=$(subir_evidencia "$C" "$V" FIRMA "$IMG")
R=$(curl -sf -X POST "$VIAJES/api/v1/viajes/$V/entrega" -H "Authorization: Bearer $C" -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' \
  -d "{\"entregaId\":\"$(uuidgen)\",\"entregadoEn\":\"$(date -u +%FT%TZ)\",\"posicion\":{\"lat\":-17.7770,\"lng\":-63.1945},\"fotos\":[\"$FOTO\"],\"firma\":{\"evidenciaId\":\"$FIRMA\",\"nombreReceptor\":\"Rosa Pérez\"}}")
esperado entrega "$(echo "$R" | json "d['estado']")" ENTREGADO
paso "Coreografía: factura, unidad, cierre y correo"
R=$(esperar "$T" "$S" "d['estado'] == 'CERRADO'" 30)
NUM=$(echo "$R" | json "d['numeroFactura']"); echo "  ✔ CERRADO con $NUM"
esperado "factura" "$(curl -sf "$FINANZAS/api/v1/facturas/$(echo "$R" | json "d['facturaId']")" -H "Authorization: Bearer $A" | json "d['monto']['monto'] + ' ' + d['estado']")" "2800.00 EMITIDA"
esperado "furgón (FF3)" "$(curl -sf "${FLOTA_URL:-http://localhost:8102}/api/v1/unidades/01933c00-0000-7000-8000-000000000011" -H "Authorization: Bearer $J" | json "d['estado'] + ' ' + str(int(d['kmDesdeUltimoMantenimiento']))")" "MANTENIMIENTO_PENDIENTE 10070"
sleep 3
esperado "correo en Mailpit" "$(curl -sf "http://localhost:8025/api/v1/search?query=$NUM" | json "str(d['messages_count'])")" 1
