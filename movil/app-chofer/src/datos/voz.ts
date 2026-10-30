import { AudioQuality, IOSOutputFormat, RecordingPresets, type RecordingOptions } from 'expo-audio';
import { initWhisper, type WhisperContext } from 'whisper.rn';

/**
 * Dictado de la bitácora (spec 005, paso 7; D38, D53): Whisper `base` en el celular, sin red. El audio se graba en un
 * archivo temporal, se transcribe y se borra; nunca se envía.
 *
 * whisper.rn lee WAV PCM de 16 kHz mono. iOS lo graba directo; Android no lo da con MediaRecorder (PoC-4), así que
 * allí el dictado queda pendiente de un adaptador PCM y el chofer escribe detenido.
 */
export const GRABACION_WAV: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  ios: {
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

let contexto: Promise<WhisperContext> | null = null;

/** El modelo se carga una vez (unos segundos) y queda en memoria mientras la app viva. */
function whisper(): Promise<WhisperContext> {
  // El modelo lo baja scripts/descargar-modelo.sh antes del build y viaja dentro de la app (asset de Metro).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  contexto ??= initWhisper({ filePath: require('../../assets/modelos/ggml-base-q5_1.bin'), useGpu: true });
  return contexto;
}

export async function transcribir(archivo: string): Promise<string> {
  const ctx = await whisper();
  const { promise } = ctx.transcribe(archivo, { language: 'es' });
  const { result } = await promise;
  return result.trim();
}

/** Precarga el modelo al abrir la bitácora para que la primera transcripción no espere la carga. */
export function precargarWhisper(): void {
  void whisper().catch(() => (contexto = null));
}
