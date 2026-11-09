/// <reference lib="webworker" />
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

// D38 y spec 015: el modelo y el runtime de ONNX salen del hosting propio; ningún pedido a un CDN.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/modelos/';
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = '/ort/';

let transcriptor: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

addEventListener('message', async ({ data }: MessageEvent<{ audio: Float32Array }>) => {
  try {
    transcriptor ??= pipeline('automatic-speech-recognition', 'whisper-tiny', {
      dtype: 'q8',
    }) as Promise<AutomaticSpeechRecognitionPipeline>;
    const resultado = await (await transcriptor)(data.audio, { language: 'spanish', task: 'transcribe' });
    postMessage({ texto: (Array.isArray(resultado) ? resultado[0] : resultado).text.trim() });
  } catch (e) {
    postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
});
