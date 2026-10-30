#!/bin/sh
# Modelo base de Whisper (D38) para la bitácora por voz: se descarga antes del build y viaja dentro de la app (no se
# versiona). Idempotente: si ya está y pesa lo esperado, no hace nada.
set -eu
DESTINO="$(dirname "$0")/../assets/modelos/ggml-base-q5_1.bin"
URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin"
if [ -s "$DESTINO" ] && [ "$(wc -c < "$DESTINO")" -gt 50000000 ]; then exit 0; fi
mkdir -p "$(dirname "$DESTINO")"
echo "Descargando el modelo de Whisper (60 MB)…"
curl -fL --retry 3 -o "$DESTINO.parcial" "$URL"
mv "$DESTINO.parcial" "$DESTINO"
