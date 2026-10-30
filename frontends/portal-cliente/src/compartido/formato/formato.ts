const ZONA = 'America/La_Paz';

/** Dinero (000 §3: siempre texto con 2 decimales). Intl formatea el texto decimal tal cual, sin pasar por float. */
export function dinero(m: { monto: string; moneda: string }): string {
  return new Intl.NumberFormat('es-BO', { style: 'currency', currency: m.moneda, currencyDisplay: 'code' }).format(
    m.monto as Intl.StringNumericLiteral,
  );
}

/** Monto en texto decimal ("1250.00") a centavos exactos con BigInt: la aritmética de dinero nunca usa `number`. */
export function aCentavos(monto: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(monto.trim());
  if (!m) throw new RangeError(`Monto inválido: ${monto}`);
  const centavos = BigInt(m[2]) * 100n + BigInt((m[3] ?? '').padEnd(2, '0'));
  return m[1] ? -centavos : centavos;
}

/** Orden de dos montos, exacto. */
export function compararMontos(a: { monto: string }, b: { monto: string }): number {
  const d = aCentavos(a.monto) - aCentavos(b.monto);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}

/** Qué porcentaje de `total` es `parte` (dos decimales, truncado), calculado en centavos. Con total 0 o menos, 0. */
export function porcentaje(parte: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  return Number((parte * 10_000n) / total) / 100;
}

export function fecha(f: string): string {
  return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${f}T00:00:00Z`));
}

export function instante(i: string): string {
  return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA }).format(new Date(i));
}

/** Hoy en La Paz más `dias`, como YYYY-MM-DD. */
export function diaDesdeHoy(dias = 0, ahora = new Date()): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(ahora);
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const TIPOS_CARGA = {
  GRANOS: 'Granos',
  INSUMOS: 'Insumos',
  INSUMOS_LIQUIDOS: 'Insumos líquidos',
  CONTENEDOR: 'Contenedor',
} as const;
