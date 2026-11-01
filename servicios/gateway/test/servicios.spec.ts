/** B4: el cliente REST reenvía las extensiones del Problem Details del servicio (spec 008: `pagoId`, `saldo`). */
import { CTX, errorDe, finanzas } from './finanzas-falso';

describe('B4: el Gateway reenvía las extensiones del Problem Details', () => {
  it('PAGO_DUPLICADO trae pagoId y PAGO_EXCEDE_SALDO trae saldo; sin type, title, detail ni instance', async () => {
    const problema = (codigo: string, status: number, extra: Record<string, unknown>) => ({
      type: `https://transporte.local/errores/${codigo.toLowerCase()}`,
      title: 'Para personas',
      status,
      detail: 'Ese pago ya está registrado en esta factura',
      instance: '/api/v1/facturas/f1/pagos',
      codigo,
      correlationId: 'c1',
      ...extra,
    });
    const { s } = finanzas((p) =>
      p.url.pathname.endsWith('/f1/pagos')
        ? { status: 409, json: problema('PAGO_DUPLICADO', 409, { pagoId: 'p1' }) }
        : { status: 422, json: problema('PAGO_EXCEDE_SALDO', 422, { saldo: { monto: '1800.00', moneda: 'BOB' } }) },
    );
    const duplicado = await errorDe(s.post(CTX, 'finanzas', '/api/v1/facturas/f1/pagos' as never));
    expect(duplicado.message).toBe('Ese pago ya está registrado en esta factura');
    expect(duplicado.extensions).toEqual({
      codigo: 'PAGO_DUPLICADO',
      status: 409,
      servicio: 'finanzas',
      pagoId: 'p1',
      correlationId: 'c1',
    });
    const excede = await errorDe(s.post(CTX, 'finanzas', '/api/v1/facturas/f2/pagos' as never));
    expect(excede.extensions).toEqual({
      codigo: 'PAGO_EXCEDE_SALDO',
      status: 422,
      servicio: 'finanzas',
      saldo: { monto: '1800.00', moneda: 'BOB' },
      correlationId: 'c1',
    });
  });

  it('el servicio no pisa codigo, status ni servicio; sin cuerpo JSON, el código sale del status', async () => {
    const { s } = finanzas((p) =>
      p.url.pathname.endsWith('/a')
        ? { status: 409, json: { codigo: 'CONFLICTO_ESTADO', status: 500, servicio: 'otro', errores: [{ campo: 'x', mensaje: 'y' }] } }
        : { status: 404, texto: 'no es json' },
    );
    expect((await errorDe(s.get(CTX, 'finanzas', '/a' as never))).extensions).toEqual({
      codigo: 'CONFLICTO_ESTADO',
      status: 409,
      servicio: 'finanzas',
      errores: [{ campo: 'x', mensaje: 'y' }],
    });
    const sinCuerpo = await errorDe(s.get(CTX, 'finanzas', '/b' as never));
    expect(sinCuerpo.extensions).toEqual({ codigo: 'NO_ENCONTRADO', status: 404, servicio: 'finanzas' });
    expect(sinCuerpo.message).toBe('Finanzas respondió 404');
  });
});
