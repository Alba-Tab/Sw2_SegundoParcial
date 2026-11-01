import { aCentavos, desdeCentavos } from './dinero';

/**
 * Validación por campo de los formularios del Centro de Control (U8, W4): reglas puras y el texto en español que va
 * bajo cada campo. Los validadores de Angular (`ui-comun`, formulario.ts) las envuelven.
 */

/** Monto en texto decimal, hasta 12 enteros y 2 decimales con punto: "2800", "2800.5", "2800.50" (000 §3, nunca float). */
export const esMonto = (texto: string): boolean => /^\d{1,12}(\.\d{1,2})?$/.test(texto.trim());

/** "2800.5" → "2800.50": lo que viaja al Gateway siempre lleva 2 decimales. */
export const montoConDecimales = (texto: string): string => {
  const centavos = aCentavos(texto);
  return centavos === null ? texto : desdeCentavos(centavos);
};

/** Un id de la URL con forma de UUID: si no la tiene, la ficha dice "no se encontró" sin consultar al servidor (D-9). */
export const esUuid = (texto: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto);

/** Errores de un campo con la forma de `ValidationErrors` de Angular. */
export type ErroresCampo = Record<string, unknown> | null | undefined;

/** El primer error de un campo, en una frase; el orden es el de importancia (primero lo que falta). */
/** Un número como se lee en Bolivia (0,5), igual que los hints (revisión E-16). */
const numero = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('es-BO') : String(n));
/** "2026-11-03" → "03/11/2026". */
const fechaCorta = (f: unknown) => String(f).split('-').reverse().join('/');

export function mensajeCampo(errores: ErroresCampo): string {
  if (!errores) return '';
  const arg = (clave: string, prop: string) => (errores[clave] as Record<string, unknown> | undefined)?.[prop];
  if (errores['required']) return 'Este dato es obligatorio.';
  if (errores['monto']) return 'Escribe el monto con punto decimal y hasta 2 decimales, por ejemplo 2800.50.';
  if (errores['montoCero']) return 'El monto debe ser mayor que 0.';
  if (errores['largoMinimo']) return `Escribe al menos ${arg('largoMinimo', 'min')} caracteres.`;
  if (errores['largoMaximo']) return `Como máximo ${arg('largoMaximo', 'max')} caracteres.`;
  if (errores['min']) return `Debe ser ${numero(arg('min', 'min'))} o más.`;
  if (errores['max']) return `Debe ser ${numero(arg('max', 'max'))} o menos.`;
  if (errores['montoMaximo']) return `El monto supera el saldo (${arg('montoMaximo', 'saldo')}).`;
  if (errores['fechaMinima']) return `La fecha no puede ser anterior al ${fechaCorta(arg('fechaMinima', 'min'))}.`;
  if (errores['fechaMaxima']) return `La fecha no puede ser posterior al ${fechaCorta(arg('fechaMaxima', 'max'))}.`;
  if (errores['lineas']) return 'Escribe de 1 a 30 ítems, uno por línea, de hasta 120 caracteres cada uno.';
  if (errores['fechaOrden']) return 'La fecha final no puede ser anterior a la inicial.';
  if (errores['rango']) return `El periodo no puede pasar de ${arg('rango', 'max')} días.`;
  return 'Revisa este dato.';
}

/** Un periodo de `desde` a `hasta` (fechas ISO): el final no va antes del inicio ni pasa de `maxDias` (reportes, spec 015). */
export function errorPeriodo(desde?: string | null, hasta?: string | null, maxDias?: number | null): ErroresCampo {
  if (!desde || !hasta) return null;
  if (hasta < desde) return { fechaOrden: true };
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
  return maxDias && dias > maxDias ? { rango: { max: maxDias } } : null;
}
