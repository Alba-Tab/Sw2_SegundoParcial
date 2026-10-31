import { Pipe, type PipeTransform } from '@angular/core';

const fecha = new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/La_Paz' });
const hora = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/La_Paz',
});

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

/** 2800.00 → "2.800,00 BOB": se formatea el texto en centavos enteros, sin pasar por `Number`. */
@Pipe({ name: 'bob' })
export class BobPipe implements PipeTransform {
  transform(monto: string | null | undefined, conMoneda = true): string {
    if (monto === null || monto === undefined) return '—';
    const centavos = aCentavos(monto);
    if (centavos === null) return String(monto);
    const absoluto = centavos < 0n ? -centavos : centavos;
    const entero = (absoluto / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decimales = (absoluto % 100n).toString().padStart(2, '0');
    return `${centavos < 0n ? '-' : ''}${entero},${decimales}${conMoneda ? ' BOB' : ''}`;
  }
}

/** "2026-11-03" → "03/11/2026"; un instante → "03/11 10:20" en La Paz. */
@Pipe({ name: 'fecha' })
export class FechaPipe implements PipeTransform {
  transform(valor: string | null | undefined, conHora = false): string {
    if (!valor) return '—';
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      const [a, m, d] = valor.split('-');
      return `${d}/${m}/${a}`;
    }
    return (conHora ? hora : fecha).format(new Date(valor));
  }
}

export const pct = (p: number | null | undefined) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)} %`);

const diaLaPaz = new Intl.DateTimeFormat('en-US', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Hoy, más `dias`, como "YYYY-MM-DD" en America/La_Paz (000 §2): las fechas por defecto nunca salen de UTC. */
export function fechaLaPaz(dias = 0, ahora: Date = new Date()): string {
  const parte = (tipo: string) => Number(diaLaPaz.formatToParts(ahora).find((p) => p.type === tipo)?.value);
  return new Date(Date.UTC(parte('year'), parte('month') - 1, parte('day') + dias)).toISOString().slice(0, 10);
}
