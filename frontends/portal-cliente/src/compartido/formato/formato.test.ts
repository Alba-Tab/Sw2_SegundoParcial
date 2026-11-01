import { describe, expect, it } from 'vitest';
import { aCentavos, compararMontos, dinero, numero, porcentaje } from './formato';

describe('dinero sin float (000 §3)', () => {
  it('convierte el texto decimal a centavos exactos', () => {
    expect(aCentavos('1250.00')).toBe(125000n);
    expect(aCentavos('0.1')).toBe(10n);
    expect(aCentavos('30000')).toBe(3000000n);
    expect(aCentavos('999999999999.99')).toBe(99999999999999n);
    expect(aCentavos('-5.25')).toBe(-525n);
    expect(() => aCentavos('1,5')).toThrow(RangeError);
    expect(() => aCentavos('1.234')).toThrow(RangeError);
  });

  it('calcula el porcentaje de uso de la línea en centavos', () => {
    // 0.1 + 0.2 con float da 0.30000000000000004; en centavos, 30 de 100 es 30 %.
    expect(porcentaje(aCentavos('0.10') + aCentavos('0.20'), aCentavos('1.00'))).toBe(30);
    expect(porcentaje(aCentavos('10640.00') + aCentavos('2800.00'), aCentavos('30000.00'))).toBe(44.8);
    expect(porcentaje(1n, 3n)).toBe(33.33);
    expect(porcentaje(5n, 0n)).toBe(0);
  });

  it('ordena montos exactos', () => {
    expect(compararMontos({ monto: '7600.00' }, { monto: '10640.00' })).toBe(-1);
    expect(compararMontos({ monto: '2800.00' }, { monto: '2800' })).toBe(0);
    expect(compararMontos({ monto: '0.20' }, { monto: '0.10' })).toBe(1);
  });

  it('formatea el texto decimal tal cual', () => {
    expect(dinero({ monto: '999999999999.99', moneda: 'BOB' })).toContain('999.999.999.999,99');
  });
});

describe('números como en Bolivia (DESIGN.md, «Números»)', () => {
  it('miles con punto y decimales con coma, nunca «1300» ni «25.5»', () => {
    expect(numero(1300, 0)).toBe('1.300');
    expect(numero(25.5)).toBe('25,5');
    expect(numero(-17.78331, 4, 4)).toBe('-17,7833');
    expect(numero(null)).toBe('Sin dato');
    expect(numero(undefined)).toBe('Sin dato');
  });
});
