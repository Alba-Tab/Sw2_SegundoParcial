#!/bin/sh
# Modelos que viajan dentro de la app y no se versionan; se descargan antes del build. Idempotente: si ya están y pesan
# lo esperado, no hace nada.
#  - Whisper base (D38) para la bitácora por voz.
#  - MediaPipe Face Landmarker (D60) para el detector de fatiga: el .task es un zip con los tres .tflite que se usan.
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
if [ ! -s "$CARPETA/face_blendshapes.tflite" ]; then
  descargar face_landmarker.task \
    https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task 3000000 \
    "MediaPipe Face Landmarker (4 MB)"
  unzip -oq "$CARPETA/face_landmarker.task" face_detector.tflite face_landmarks_detector.tflite face_blendshapes.tflite \
    -d "$CARPETA"
  rm "$CARPETA/face_landmarker.task"
fi
