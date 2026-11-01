import { pagoRepetido, saldoDelError, saldoDespuesDe } from './pago';

describe('pago (dominio, spec 008)', () => {
  it('el saldo que queda se calcula en centavos, sin float (E-19)', () => {
    expect(saldoDespuesDe('2800.00', '1000.00')).toBe('1800.00');
    expect(saldoDespuesDe('0.30', '0.10')).toBe('0.20');
    expect(saldoDespuesDe('2800.00', '2800')).toBe('0.00');
  });

  it('con un monto mayor que el saldo da negativo: por eso el formulario no deja pedir la confirmación', () => {
    expect(saldoDespuesDe('2300.00', '2800.00')).toBe('-500.00');
  });

  it('PAGO_DUPLICADO: encuentra el pago existente por pagoId o, sin él, por medio y referencia', () => {
    const pagos = [
      { pagoId: 'p1', medio: 'TRANSFERENCIA', referencia: 'BNB-1' },
      { pagoId: 'p2', medio: 'DEPOSITO', referencia: 'BNB-1' },
    ];
    expect(pagoRepetido(pagos, 'p2', 'TRANSFERENCIA', 'BNB-1')?.pagoId).toBe('p2');
    expect(pagoRepetido(pagos, undefined, 'DEPOSITO', ' BNB-1 ')?.pagoId).toBe('p2');
    expect(pagoRepetido(pagos, 'otro', 'TRANSFERENCIA', 'BNB-1')?.pagoId).toBe('p1');
    expect(pagoRepetido(pagos, undefined, 'CHEQUE', 'BNB-1')).toBeUndefined();
  });

  it('PAGO_EXCEDE_SALDO: el saldo del error si viene; si no, el de pantalla', () => {
    expect(saldoDelError({ monto: '1000.00', moneda: 'BOB' }, '1800.00')).toBe('1000.00');
    expect(saldoDelError(undefined, '1800.00')).toBe('1800.00');
    expect(saldoDelError({ monto: 'mil' }, '1800.00')).toBe('1800.00');
    expect(saldoDelError(null, undefined)).toBeUndefined();
  });
});
