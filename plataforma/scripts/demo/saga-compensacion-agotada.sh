#!/usr/bin/env bash
# FS8 (spec 011). Necesita el perfil demo y Finanzas a través de Toxiproxy:
#   docker compose --env-file .env --env-file .env.demo --profile core --profile plataforma --profile demo up -d
# (1) apaga el worker de Flota; (2) confirma FS4 con el paso 2 reservado; (3) corta la base de Finanzas; (4) enciende
# Flota → SIN_UNIDAD_COMPATIBLE → Finanzas.liberarCredito se agota (4 intentos o 2 min) → REQUIERE_INTERVENCION.
# Luego restaura la base y el despachador elige "reintentar" (o --resuelto para "marcar como resuelto").
. "$(dirname "$0")/comun.sh"
F="$RAIZ/plataforma/scripts/fallos"
T=$(token agroexport); D=$(token despachador1)
COT=$(cotizar "$T" $COCHABAMBA INSUMOS_LIQUIDOS 20)
"$F/apagar-worker-flota.sh"
R=$(confirmar "$T" "$COT"); S=$(echo "$R" | json "d['servicioId']"); V=$(echo "$R" | json "d['viajeId']")
esperar "$T" "$S" "d.get('etapa') == 'RESERVANDO_UNIDAD'" 30 >/dev/null
"$F/cortar-db-finanzas.sh" off
"$F/encender-worker-flota.sh"
esperar "$T" "$S" "d['estado'] == 'REQUIERE_INTERVENCION'" 300 >/dev/null
echo "  ✔ REQUIERE_INTERVENCION (ViajeRequiereIntervencion en analitica.eventos: http://localhost:15672)"
"$F/cortar-db-finanzas.sh" on
if [ "${1:-}" = "--resuelto" ]; then CUERPO='{"opcion":"MARCAR_RESUELTO","nota":"Crédito revisado a mano"}'; ESPERADO=RESUELTO_MANUALMENTE
else CUERPO='{"opcion":"REINTENTAR_COMPENSACION"}'; ESPERADO=SIN_UNIDAD_COMPATIBLE; fi
esperado intervención "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$VIAJES/api/v1/viajes/$V/intervencion" -H "Authorization: Bearer $D" \
  -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' -d "$CUERPO")" 202
R=$(esperar "$T" "$S" "d['estado'] == 'CANCELADO'" 120)
esperado motivo "$(echo "$R" | json "d['motivo']")" "$ESPERADO"
