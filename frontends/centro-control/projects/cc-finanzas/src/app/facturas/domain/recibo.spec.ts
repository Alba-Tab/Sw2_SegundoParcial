import { completarConRecibo, interpretar } from './recibo';

describe('OCR del recibo', () => {
  it('lo leído reemplaza solo los campos que trae', () => {
    const pago = { monto: '', fecha: '2026-10-30', medio: 'TRANSFERENCIA', referencia: 'A' };
    expect(completarConRecibo(pago, { monto: '2800.00', referencia: undefined })).toEqual({ ...pago, monto: '2800.00' });
  });

  it('elige el mayor monto comparando centavos enteros, no floats', () => {
    expect(interpretar('Comisión 9.007.199.254.740.992,01\nTotal 9.007.199.254.740.992,02').monto).toBe('9007199254740992.02');
    expect(interpretar('950.50 y 2.800,00 y 12,00').monto).toBe('2800.00');
  });

  it('lee el monto entero aunque no tenga separador de miles', () => {
    expect(interpretar('Total Bs 2800,00').monto).toBe('2800.00');
    expect(interpretar('Monto 12500,50').monto).toBe('12500.50');
  });

  it('propone monto, fecha y referencia del texto leído', () => {
    expect(interpretar('BANCO UNION\nFecha: 28/10/2026\nRef: TRX-99812\nComisión 5,00\nTotal Bs 2.800,00')).toEqual({
      monto: '2800.00',
      fecha: '2026-10-28',
      referencia: 'TRX-99812',
    });
  });
});
