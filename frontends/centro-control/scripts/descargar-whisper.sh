#!/bin/sh
# Whisper tiny (D38) para la consulta por voz de cc-tablero: se sirve desde el hosting de la app, nunca desde un CDN
# (spec 015: la pestaña Red queda vacía al transcribir). No se versiona; se baja antes de servir o construir.
set -eu
DESTINO="$(dirname "$0")/../projects/cc-tablero/public/modelos/whisper-tiny"
BASE="https://huggingface.co/Xenova/whisper-tiny/resolve/main"
mkdir -p "$DESTINO/onnx"
for f in config.json generation_config.json preprocessor_config.json tokenizer.json tokenizer_config.json \
  onnx/encoder_model_quantized.onnx onnx/decoder_model_merged_quantized.onnx; do
  [ -s "$DESTINO/$f" ] && continue
  echo "Descargando $f…"
  curl -fsL --retry 3 -o "$DESTINO/$f.parcial" "$BASE/$f" && mv "$DESTINO/$f.parcial" "$DESTINO/$f"
done
