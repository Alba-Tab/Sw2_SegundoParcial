#!/bin/sh
# Tesseract `spa` (D38) para el OCR de recibos de cc-finanzas (spec 008, paso 2): se sirve desde el hosting de la app,
# nunca desde un CDN en el navegador. Es el mismo modelo que tesseract.js 7 bajaría solo (4.0.0_best_int, LSTM).
# El worker y el core salen de node_modules (angular.json los copia a /tesseract). No se versiona.
set -eu
DESTINO="$(dirname "$0")/../projects/cc-finanzas/public/tesseract"
ARCHIVO="spa.traineddata.gz"
URL="https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa@1.0.0/4.0.0_best_int/$ARCHIVO"
mkdir -p "$DESTINO"
[ -s "$DESTINO/$ARCHIVO" ] && exit 0
echo "Descargando $ARCHIVO…"
curl -fsL --retry 3 -o "$DESTINO/$ARCHIVO.parcial" "$URL" && mv "$DESTINO/$ARCHIVO.parcial" "$DESTINO/$ARCHIVO"
