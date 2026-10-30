#!/bin/sh
# Modelos que viajan dentro de la app y no se versionan; se descargan antes del build. Idempotente: si ya están y pesan
# lo esperado, no hace nada.
#  - Whisper base (D38) para la bitácora por voz.
#  - Malla facial de MediaPipe (D60) para el detector de fatiga.
set -eu
CARPETA="$(dirname "$0")/../assets/modelos"
mkdir -p "$CARPETA"

descargar() { # archivo url bytes-minimos descripcion
  if [ -s "$CARPETA/$1" ] && [ "$(wc -c < "$CARPETA/$1")" -gt "$3" ]; then return 0; fi
  echo "Descargando $4…"
  curl -fL --retry 3 -o "$CARPETA/$1.parcial" "$2"
  mv "$CARPETA/$1.parcial" "$CARPETA/$1"
}

descargar ggml-base-q5_1.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin 50000000 \
  "el modelo de Whisper (60 MB)"
descargar face_landmark.tflite https://storage.googleapis.com/mediapipe-assets/face_landmark.tflite 1000000 \
  "la malla facial de MediaPipe (1 MB)"
