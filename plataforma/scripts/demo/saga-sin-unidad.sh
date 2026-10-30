#!/usr/bin/env bash
# FS4: Cochabamba con 20 t de INSUMOS_LIQUIDOS (6.250); la única cisterna está en MANTENIMIENTO_PENDIENTE. En la
# Temporal UI se ve Finanzas.liberarCredito antes que Viajes.cancelarViaje.
. "$(dirname "$0")/comun.sh"
T=$(token agroexport); A=$(token administracion1)
ANTES=$(disponible "$A" $AGROEXPORT)
COT=$(cotizar "$T" $COCHABAMBA INSUMOS_LIQUIDOS 20)
S=$(confirmar "$T" "$COT" | json "d['servicioId']")
R=$(esperar "$T" "$S" "d['estado'] == 'CANCELADO'" 30)
esperado motivo "$(echo "$R" | json "d['motivo']")" SIN_UNIDAD_COMPATIBLE
esperado "disponible (se liberó el crédito)" "$(disponible "$A" $AGROEXPORT)" "$ANTES"
echo "Historial: http://localhost:8233/namespaces/transporte/workflows/programar-viaje-$S"
