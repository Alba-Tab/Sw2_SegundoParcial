import { Pipe, type PipeTransform } from '@angular/core';
import { aCentavos } from 'ui-comun/dominio';

const fecha = new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/La_Paz' });
const hora = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/La_Paz',
});

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
