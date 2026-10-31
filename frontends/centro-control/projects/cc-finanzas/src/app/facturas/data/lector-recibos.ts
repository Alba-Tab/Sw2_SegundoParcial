import { interpretar, type DatosRecibo } from '../domain/recibo';

/**
 * D38 y spec 008, paso 2: worker, core y `spa` salen del hosting propio (`/tesseract`, ver angular.json y
 * `npm run modelos`); sin estas rutas tesseract.js los pide a jsdelivr. Van absolutas porque se resuelven dentro del
 * worker. Con `corePath` como carpeta, tesseract.js elige el core LSTM con o sin SIMD según el navegador.
 */
export function rutasTesseract(origen: string) {
  const base = `${origen}/tesseract`;
  return { workerPath: `${base}/worker.min.js`, corePath: `${base}/`, langPath: base, workerBlobURL: false };
}

/** OCR en el navegador con Tesseract.js (propuesta 6.1): la imagen no sale del equipo. */
export async function leerRecibo(imagen: File): Promise<DatosRecibo> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('spa', undefined, rutasTesseract(window.location.origin));
  try {
    const { data } = await worker.recognize(imagen);
    return interpretar(data.text);
  } finally {
    await worker.terminate();
  }
}
