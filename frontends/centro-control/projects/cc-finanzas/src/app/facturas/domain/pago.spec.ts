import { saldoDespuesDe } from './pago';

describe('pago (dominio, spec 008)', () => {
  it('el saldo que queda se calcula en centavos, sin float (E-19)', () => {
    expect(saldoDespuesDe('2800.00', '1000.00')).toBe('1800.00');
    expect(saldoDespuesDe('0.30', '0.10')).toBe('0.20');
    expect(saldoDespuesDe('2800.00', '2800')).toBe('0.00');
  });

  it('con un monto mayor que el saldo da negativo: por eso el formulario no deja pedir la confirmación', () => {
    expect(saldoDespuesDe('2300.00', '2800.00')).toBe('-500.00');
  });
});
