/**
 * Dinero sin float (000 §3): "2800.5" → 280050n centavos, con HALF_UP a 2 decimales. `null` si el texto no es un
 * decimal. Los montos viajan como texto; para sumarlos o compararlos se pasan a centavos enteros.
 */
export function aCentavos(monto: string | number): bigint | null {
  const m = /^\s*(-)?(\d+)(?:\.(\d+))?\s*$/.exec(String(monto));
  if (!m) return null;
  const [, signo, entero, decimales = ''] = m;
  let centavos = BigInt(entero) * 100n + BigInt(decimales.padEnd(2, '0').slice(0, 2));
  if (decimales.length > 2 && Number(decimales[2]) >= 5) centavos += 1n;
  return signo ? -centavos : centavos;
}

/** 280050n → "2800.50". */
export function desdeCentavos(centavos: bigint): string {
  const absoluto = centavos < 0n ? -centavos : centavos;
  return `${centavos < 0n ? '-' : ''}${absoluto / 100n}.${(absoluto % 100n).toString().padStart(2, '0')}`;
}

/** Suma exacta de montos en texto; lo que no es un decimal cuenta 0. */
export function sumarMontos(montos: unknown[]): string {
  return desdeCentavos(montos.reduce<bigint>((total, m) => total + (aCentavos(String(m ?? '0')) ?? 0n), 0n));
}

/**
 * Estado de una línea de crédito (grupo EstadoLineaCredito): suspendida manda (la saga no reserva, spec 012); después la
 * mora; sin disponible, aviso; si no, al día. `suspendida` es opcional: no todas las pantallas la piden.
 */
export function estadoLineaCredito(l: {
  enMora: boolean;
  disponible: string;
  suspendida?: boolean | null;
}): 'AL_DIA' | 'SIN_DISPONIBLE' | 'EN_MORA' | 'SUSPENDIDA' {
  if (l.suspendida) return 'SUSPENDIDA';
  if (l.enMora) return 'EN_MORA';
  return (aCentavos(l.disponible) ?? 0n) <= 0n ? 'SIN_DISPONIBLE' : 'AL_DIA';
}
