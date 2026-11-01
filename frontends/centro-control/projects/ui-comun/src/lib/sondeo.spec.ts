import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { firstValueFrom, of, toArray } from 'rxjs';
import { conservarUltimoBueno } from './sondeo';

type R = { data?: { viajes?: string[] | null; clientes?: string[] | null }; error?: unknown; loading?: boolean };

describe('conservarUltimoBueno (FB-1)', () => {
  const emitir = (...rs: R[]) =>
    firstValueFrom(
      of(...rs).pipe(
        conservarUltimoBueno<R>(() => '2026-11-01T14:20:00Z'),
        toArray(),
      ),
    );

  it('un sondeo fallido no vacía la tabla: repone lo que llegó vacío y dice de cuándo es', async () => {
    const [, red, campo] = await emitir(
      { data: { viajes: ['A'], clientes: ['X'] } },
      { error: new TypeError('Failed to fetch') },
      { data: { viajes: null, clientes: ['Y'] }, error: 'Viajes no disponible' },
    );
    expect(red).toMatchObject({ data: { viajes: ['A'], clientes: ['X'] }, datosAl: '2026-11-01T14:20:00Z' });
    expect(campo).toMatchObject({ data: { viajes: ['A'], clientes: ['Y'] }, datosAl: '2026-11-01T14:20:00Z' });
  });

  it('repone un campo anidado de otro servicio (clientes[i].lineaCredito) por la clave de la fila, solo donde hay error', async () => {
    type C = { data?: { clientes: { clienteId: string; lineaCredito: { disponible: string } | null }[] }; error?: unknown };
    const caida = new CombinedGraphQLErrors({
      errors: [
        { message: 'Finanzas no disponible', path: ['clientes', 0, 'lineaCredito'], extensions: { codigo: 'DEPENDENCIA_NO_DISPONIBLE' } },
      ],
    });
    const [, segundo] = await firstValueFrom(
      of<C[]>(
        {
          data: {
            clientes: [
              { clienteId: 'b', lineaCredito: null },
              { clienteId: 'a', lineaCredito: { disponible: '10.00' } },
            ],
          },
        },
        // Llegan en otro orden: la fila 0 (a) perdió su línea por el error; b sigue sin línea (es un dato).
        {
          data: {
            clientes: [
              { clienteId: 'a', lineaCredito: null },
              { clienteId: 'b', lineaCredito: null },
            ],
          },
          error: caida,
        },
      ).pipe(
        conservarUltimoBueno<C>(() => '2026-11-01T14:20:00Z', { clientes: { clave: 'clienteId', campos: ['lineaCredito'] } }),
        toArray(),
      ),
    );
    expect(segundo.data?.clientes).toEqual([
      { clienteId: 'a', lineaCredito: { disponible: '10.00' } },
      { clienteId: 'b', lineaCredito: null },
    ]);
    expect(segundo.datosAl).toBe('2026-11-01T14:20:00Z');
  });

  it('una respuesta sin errores manda, aunque traiga menos filas; sin datos previos, el fallo pasa tal cual', async () => {
    const [primero, , bueno] = await emitir({ error: 'caído' }, { data: { viajes: ['A'] } }, { data: { viajes: [] } });
    expect(primero).toEqual({ error: 'caído' });
    expect(bueno).toEqual({ data: { viajes: [] } });
  });
});
