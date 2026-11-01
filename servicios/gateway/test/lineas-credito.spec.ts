/** Líneas de crédito en el Gateway: B5 (lote por DataLoader) y G6 (mutaciones de la línea, spec 012). */
import { GraphQLError } from 'graphql';
import { crearCargadores } from '../src/graphql/cargadores';
import { mutacionesLineaCredito } from '../src/graphql/gestion-finanzas';
import { C1, C2, CTX, errorDe, finanzas, linea } from './finanzas-falso';

describe('B5: las líneas de crédito de una lista de clientes van por lotes', () => {
  it('150 clientes son 2 llamadas de hasta 100; sin línea es null; un id inválido falla solo él', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `01933b5a-1f00-7a20-8b11-${String(i).padStart(12, '0')}`);
    const { s, pedidos } = finanzas((p) => {
      const pedidosIds = (p.url.searchParams.get('clienteIds') ?? '').split(',');
      // El cliente 7 no tiene línea; Finanzas no lo devuelve.
      return { status: 200, json: { items: pedidosIds.filter((id) => id !== ids[7]).map((id) => linea(id)) } };
    });
    const cargadores = crearCargadores(s, CTX);
    const r = await cargadores.lineaCredito.loadMany([...ids, ids[0].toUpperCase(), 'no-es-uuid']);
    expect(pedidos.map((p) => `${p.metodo} ${p.url.pathname}`)).toEqual(Array(2).fill('GET /api/v1/lineas-credito'));
    // El segundo lote trae los 50 que faltan y el primero en mayúsculas, que va otra vez en minúsculas.
    expect(pedidos.map((p) => p.url.searchParams.get('clienteIds')!.split(',').length)).toEqual([100, 51]);
    expect(r[0]).toEqual({
      clienteId: ids[0],
      limite: '30000.00',
      reservado: '0.00',
      utilizado: '0.00',
      disponible: '30000.00',
      enMora: false,
      suspendida: false,
    });
    expect(r[7]).toBeNull();
    expect(r[150]).toEqual(r[0]);
    expect((r[151] as GraphQLError).extensions['codigo']).toBe('VALIDACION');
  });

  it('si Finanzas no responde, cada línea del lote sale con DEPENDENCIA_NO_DISPONIBLE', async () => {
    const { s } = finanzas(() => ({ status: 503, json: {} }));
    const r = await crearCargadores(s, CTX).lineaCredito.loadMany([C1, C2]);
    expect(r.map((e) => (e as GraphQLError).extensions['codigo'])).toEqual(['DEPENDENCIA_NO_DISPONIBLE', 'DEPENDENCIA_NO_DISPONIBLE']);
  });
});

describe('G6: mutaciones de la línea de crédito', () => {
  it('ajustarLineaCredito hace PUT con el Monto y la clave, y devuelve la línea sin releerla', async () => {
    const { s, pedidos } = finanzas(() => ({ status: 200, json: linea(C1, { limite: { monto: '50000.00', moneda: 'BOB' } }) }));
    const r = await mutacionesLineaCredito(s).ajustarLineaCredito(
      null,
      { clienteId: C1, limite: '50000.00', motivo: 'Revisión anual', claveIdempotencia: 'k1' },
      CTX,
    );
    expect(r['limite']).toBe('50000.00');
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({
      metodo: 'PUT',
      cuerpo: { limite: { monto: '50000.00', moneda: 'BOB' }, motivo: 'Revisión anual' },
      cabeceras: { 'Idempotency-Key': 'k1', Authorization: 'Bearer token-finanzas' },
    });
    expect(pedidos[0].url.pathname).toBe(`/api/v1/lineas-credito/${C1}`);
  });

  it('LIMITE_MENOR_QUE_USADO llega con usado; cambiarEstadoLineaCredito hace POST a /estado', async () => {
    const { s, pedidos } = finanzas((p) =>
      p.metodo === 'PUT'
        ? { status: 409, json: { codigo: 'LIMITE_MENOR_QUE_USADO', detail: 'No', usado: { monto: '10400.00', moneda: 'BOB' } } }
        : { status: 200, json: linea(C1, { suspendida: true }) },
    );
    const mutaciones = mutacionesLineaCredito(s);
    const e = await errorDe(
      mutaciones.ajustarLineaCredito(null, { clienteId: C1, limite: '1.00', motivo: 'Baja', claveIdempotencia: 'k' }, CTX),
    );
    expect(e.extensions).toMatchObject({ codigo: 'LIMITE_MENOR_QUE_USADO', status: 409, usado: { monto: '10400.00', moneda: 'BOB' } });
    const r = await mutaciones.cambiarEstadoLineaCredito(
      null,
      { clienteId: C1, suspendida: true, motivo: 'Cheque rechazado', claveIdempotencia: 'k2' },
      CTX,
    );
    expect(r['suspendida']).toBe(true);
    expect(pedidos[1]).toMatchObject({ metodo: 'POST', cuerpo: { suspendida: true, motivo: 'Cheque rechazado' } });
    expect(pedidos[1].url.pathname).toBe(`/api/v1/lineas-credito/${C1}/estado`);
    await expect(
      mutaciones.cambiarEstadoLineaCredito(null, { clienteId: '../x', suspendida: true, motivo: 'abc', claveIdempotencia: 'k3' }, CTX),
    ).rejects.toMatchObject({ extensions: { codigo: 'VALIDACION' } });
    expect(pedidos).toHaveLength(2);
  });
});
