import { Pipe, type PipeTransform } from '@angular/core';
import { aCentavos, numero, SIN_DATO } from 'ui-comun/dominio';

// en-GB con h23: dígitos y 24 h en cualquier motor; el texto se arma con las partes, no con el formato del locale
// (es-BO da "1/11, 10:20 a. m.").
const partesLaPaz = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/La_Paz',
});

/**
 * 2800.00 → "2.800,00 BOB": se formatea el texto en centavos enteros, sin pasar por `Number`. Entre el número y «BOB» va
 * un espacio duro: el monto nunca se parte en dos líneas (RS-2).
 */
@Pipe({ name: 'bob' })
export class BobPipe implements PipeTransform {
  transform(monto: string | null | undefined, conMoneda = true): string {
    if (monto === null || monto === undefined) return SIN_DATO;
    const centavos = aCentavos(monto);
    if (centavos === null) return String(monto);
    const absoluto = centavos < 0n ? -centavos : centavos;
    const entero = (absoluto / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decimales = (absoluto % 100n).toString().padStart(2, '0');
    return `${centavos < 0n ? '-' : ''}${entero},${decimales}${conMoneda ? '\u00a0BOB' : ''}`;
  }
}

/** "2026-11-03" → "03/11/2026"; un instante → "03/11 10:20" en La Paz. */
@Pipe({ name: 'fecha' })
export class FechaPipe implements PipeTransform {
  transform(valor: string | null | undefined, conHora = false): string {
    if (!valor) return SIN_DATO;
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      const [a, m, d] = valor.split('-');
      return `${d}/${m}/${a}`;
    }
    const instante = new Date(valor);
    if (Number.isNaN(instante.getTime())) return valor;
    const p = Object.fromEntries(partesLaPaz.formatToParts(instante).map((x) => [x.type, x.value]));
    return conHora ? `${p['day']}/${p['month']} ${p['hour']}:${p['minute']}` : `${p['day']}/${p['month']}/${p['year']}`;
  }
}

/** `{{ km | numero }}` → "1.300"; `{{ puntaje | numero: 2 : 2 }}` → "0,65" (decimales máximos y mínimos). */
@Pipe({ name: 'numero' })
export class NumeroPipe implements PipeTransform {
  transform(valor: number | string | null | undefined, maximo = 2, minimo = 0): string {
    return numero(valor, maximo, minimo);
  }
}
