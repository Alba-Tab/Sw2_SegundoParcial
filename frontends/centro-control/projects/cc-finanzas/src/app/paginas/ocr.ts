import { aCentavos } from 'ui-comun';

/**
 * OCR de recibos en el navegador con Tesseract.js (propuesta 6.1): la imagen no sale del equipo. Solo propone datos;
 * la persona los revisa antes de registrar el pago.
 */
export interface DatosRecibo {
  monto?: string;
  fecha?: string;
  referencia?: string;
}

export function interpretar(texto: string): DatosRecibo {
  const datos: DatosRecibo = {};
  // Montos bolivianos: 2.800,00 o 2800.00; se toma el mayor (el total del recibo).
  const montos = [...texto.matchAll(/(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+\.\d{2})/g)].map((m) =>
    m[1].includes(',') ? m[1].replace(/[.\s]/g, '').replace(',', '.') : m[1],
  );
  const centavos = (m: string) => aCentavos(m) ?? 0n;
  if (montos.length) datos.monto = montos.sort((a, b) => (centavos(b) > centavos(a) ? 1 : centavos(b) < centavos(a) ? -1 : 0))[0];
  const fecha = texto.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (fecha) datos.fecha = `${fecha[3]}-${fecha[2]}-${fecha[1]}`;
  const referencia = texto.match(/(?:ref(?:erencia)?|nro\.?|transacci[oó]n|comprobante)\s*[:#]?\s*([A-Z0-9-]{4,})/i);
  if (referencia) datos.referencia = referencia[1].toUpperCase();
  return datos;
}

/**
 * D38 y spec 008, paso 2: worker, core y `spa` salen del hosting propio (`/tesseract`, ver angular.json y
 * `npm run modelos`); sin estas rutas tesseract.js los pide a jsdelivr. Van absolutas porque se resuelven dentro del
 * worker. Con `corePath` como carpeta, tesseract.js elige el core LSTM con o sin SIMD según el navegador.
 */
export function rutasTesseract(origen: string) {
  const base = `${origen}/tesseract`;
  return { workerPath: `${base}/worker.min.js`, corePath: `${base}/`, langPath: base, workerBlobURL: false };
}

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
