import { aCentavos } from 'ui-comun/dominio';

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
  // Montos bolivianos: 2.800,00, 2800,00 o 2800.00; se toma el mayor (el total del recibo). El (?<!\d) evita leer
  // "800,00" dentro de "2800,00".
  const montos = [...texto.matchAll(/(?<!\d)(\d{1,3}(?:[.\s]\d{3})+,\d{2}|\d+[,.]\d{2})/g)].map((m) =>
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

/** Lo que el OCR leyó reemplaza solo los campos que trae; la persona revisa antes de registrar. */
export function completarConRecibo<T extends object>(pago: T, leido: DatosRecibo): T {
  return { ...pago, ...Object.fromEntries(Object.entries(leido).filter(([, v]) => v)) };
}
