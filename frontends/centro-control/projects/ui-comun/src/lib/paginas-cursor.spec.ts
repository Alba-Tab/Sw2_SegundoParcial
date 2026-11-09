import { signal } from '@angular/core';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { PaginasCursor, type PaginaCursor } from './paginas-cursor';

type Fila = { id: string; linea?: string | null };
const filas = (...ids: string[]): Fila[] => ids.map((id) => ({ id }));
const conId = (f: Fila) => f.id;

describe('PaginasCursor (E5-1, E2-6, E2-2)', () => {
  it('agrega la página siguiente al final y deja de ofrecer más en la última', async () => {
    const primera = signal<PaginaCursor<Fila> | undefined>({ items: filas('a', 'b'), siguienteCursor: 'c1' });
    const pedir = vi.fn(async (c: string) => ({
      pagina: c === 'c1' ? { items: filas('c'), siguienteCursor: 'c2' } : { items: filas('d'), siguienteCursor: null },
    }));
    const p = new PaginasCursor(primera, pedir, conId);
    await p.cargarMas();
    await p.cargarMas();
    expect(p.items().map(conId)).toEqual(['a', 'b', 'c', 'd']);
    expect(p.siguienteCursor()).toBeNull();
    await p.cargarMas();
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it('no repite una fila que el sondeo corrió de una página a otra (deduplica por id)', async () => {
    const primera = signal<PaginaCursor<Fila>>({ items: filas('a', 'b'), siguienteCursor: 'c1' });
    const p = new PaginasCursor(primera, async () => ({ pagina: { items: filas('b', 'c'), siguienteCursor: null } }), conId);
    await p.cargarMas();
    expect(p.items().map(conId)).toEqual(['a', 'b', 'c']);
  });

  it('del más nuevo al más viejo: si cambia el borde de la primera página, las extra se descartan y se vuelve a pedir', async () => {
    const primera = signal<PaginaCursor<Fila>>({ items: filas('d', 'c'), siguienteCursor: 'c' });
    const pedir = vi.fn(async (c: string) => ({ pagina: { items: c === 'c' ? filas('b', 'a') : filas('a'), siguienteCursor: null } }));
    const p = new PaginasCursor(primera, pedir, conId);
    await p.cargarMas();
    expect(p.items().map(conId)).toEqual(['d', 'c', 'b', 'a']);
    // Llega «e»: «c» pasa a la segunda página. Seguir con la extra vieja dejaría a «c» afuera.
    primera.set({ items: filas('e', 'd'), siguienteCursor: 'd' });
    expect(p.items().map(conId)).toEqual(['e', 'd']);
    expect(p.siguienteCursor()).toBe('d');
    await p.cargarMas();
    expect(pedir).toHaveBeenLastCalledWith('d');
  });

  it('E2-2: si la página falla (error o null), no cambia lo mostrado, conserva el cursor y expone el error', async () => {
    const caida = new Error('sin red');
    const pedir = vi
      .fn()
      .mockResolvedValueOnce({ pagina: null, error: caida })
      .mockRejectedValueOnce(caida)
      .mockResolvedValueOnce({ pagina: { items: filas('b'), siguienteCursor: null } });
    const p = new PaginasCursor(() => ({ items: filas('a'), siguienteCursor: 'c1' }), pedir, conId);
    await p.cargarMas();
    expect(p.error()).toBe(caida);
    expect(p.siguienteCursor()).toBe('c1');
    await p.cargarMas();
    expect(p.items().map(conId)).toEqual(['a']);
    await p.cargarMas();
    expect(p.error()).toBeUndefined();
    expect(p.items().map(conId)).toEqual(['a', 'b']);
  });

  it('E2-2: cuenta las filas con error de la primera página y de las extra, por id', async () => {
    const error = (i: number) =>
      new CombinedGraphQLErrors({ errors: [{ message: 'x', path: ['clientes', 'items', i, 'linea'], extensions: {} }] });
    const p = new PaginasCursor(
      () => ({ items: filas('a', 'b'), siguienteCursor: 'c1' }),
      async () => ({ pagina: { items: filas('c', 'd'), siguienteCursor: null }, error: error(1) }),
      conId,
    );
    await p.cargarMas();
    expect([...p.idsConError('clientes.items', 'linea', error(0))]).toEqual(['a', 'd']);
  });
});
