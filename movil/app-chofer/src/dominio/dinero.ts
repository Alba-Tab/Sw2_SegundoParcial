/**
 * Dinero (000 §3): siempre texto decimal con 2 decimales, nunca `number`. El chofer escribe el monto con punto o coma;
 * se valida y se normaliza como texto, sin pasar por float.
 */
const MONTO_ESCRITO = /^(\d{1,12})(?:[.,](\d{1,2}))?$/;

/** "675,5" → "675.50"; "0675" → "675.00". `null` si no es un monto válido (hasta 12 enteros y 2 decimales). */
export function normalizarMonto(texto: string): string | null {
  const m = MONTO_ESCRITO.exec(texto.trim());
  if (!m) return null;
  const entero = m[1].replace(/^0+(?=\d)/, '');
  return `${entero}.${(m[2] ?? '').padEnd(2, '0')}`;
}

/** Mayor que cero, mirando los dígitos del texto ya normalizado. */
export function esPositivo(monto: string): boolean {
  return /[1-9]/.test(monto);
}
