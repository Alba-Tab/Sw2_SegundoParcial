import Decimal from 'decimal.js';
import { ErrorDeDominio } from './error-de-dominio';

/** Dinero (000 §3): texto decimal en el transporte, aritmética con decimal.js (nunca number), BOB y nunca negativo. */
export class Monto {
  private constructor(
    private readonly valor: Decimal,
    readonly moneda: 'BOB',
  ) {}

  static bob(monto: string | Decimal): Monto {
    let valor: Decimal;
    try {
      valor = new Decimal(monto);
    } catch {
      throw new ErrorDeDominio('VALIDACION', `Monto inválido: ${String(monto)}`);
    }
    if (valor.isNegative()) throw new ErrorDeDominio('VALIDACION', 'El monto no puede ser negativo');
    return new Monto(valor.toDecimalPlaces(2, Decimal.ROUND_HALF_UP), 'BOB');
  }

  static desdeContrato(m: { monto: string; moneda: string }): Monto {
    if (m.moneda !== 'BOB') throw new ErrorDeDominio('VALIDACION', `Moneda no soportada: ${m.moneda}`);
    return Monto.bob(m.monto);
  }

  mas(otro: Monto): Monto {
    return Monto.bob(this.valor.plus(otro.valor));
  }

  por(factor: string | number): Monto {
    return Monto.bob(this.valor.times(factor));
  }

  esPositivo(): boolean {
    return this.valor.greaterThan(0);
  }

  aContrato(): { monto: string; moneda: 'BOB' } {
    return { monto: this.valor.toFixed(2), moneda: this.moneda };
  }
}
