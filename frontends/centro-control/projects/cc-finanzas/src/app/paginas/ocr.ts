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
  if (montos.length) datos.monto = montos.sort((a, b) => Number(b) - Number(a))[0];
  const fecha = texto.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (fecha) datos.fecha = `${fecha[3]}-${fecha[2]}-${fecha[1]}`;
  const referencia = texto.match(/(?:ref(?:erencia)?|nro\.?|transacci[oó]n|comprobante)\s*[:#]?\s*([A-Z0-9-]{4,})/i);
  if (referencia) datos.referencia = referencia[1].toUpperCase();
  return datos;
}

export async function leerRecibo(imagen: File): Promise<DatosRecibo> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('spa');
  try {
    const { data } = await worker.recognize(imagen);
    return interpretar(data.text);
  } finally {
    await worker.terminate();
  }
}
