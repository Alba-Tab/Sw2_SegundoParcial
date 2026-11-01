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

  it('una respuesta sin errores manda, aunque traiga menos filas; sin datos previos, el fallo pasa tal cual', async () => {
    const [primero, , bueno] = await emitir({ error: 'caído' }, { data: { viajes: ['A'] } }, { data: { viajes: [] } });
    expect(primero).toEqual({ error: 'caído' });
    expect(bueno).toEqual({ data: { viajes: [] } });
  });
});
