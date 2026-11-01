import { signal } from '@angular/core';
import { PaginasPorCursor, type Pagina } from './paginas';

type Fila = { id: string };
const filas = (...ids: string[]): Fila[] => ids.map((id) => ({ id }));

describe('«Cargar más» por cursor (E5-1)', () => {
  it('agrega las páginas siguientes sin repetir filas y termina sin cursor', async () => {
    const primera = signal<Pagina<Fila> | undefined>({ items: filas('a', 'b'), siguienteCursor: 'c1' });
    const pedir = vi.fn(async (cursor: string) =>
      cursor === 'c1' ? { items: filas('b', 'c'), siguienteCursor: 'c2' } : { items: filas('d'), siguienteCursor: null },
    );
    const p = new PaginasPorCursor(primera, pedir, (f) => f.id);
    expect(p.siguienteCursor()).toBe('c1');
    await p.cargarMas();
    expect(p.items().map((f) => f.id)).toEqual(['a', 'b', 'c']);
    await p.cargarMas();
    expect(p.items().map((f) => f.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(p.siguienteCursor()).toBeNull();
    await p.cargarMas();
    expect(pedir).toHaveBeenCalledTimes(2);
    // El sondeo trae la primera página otra vez: lo ya cargado sigue al final, sin duplicar.
    primera.set({ items: filas('z', 'a', 'b'), siguienteCursor: 'c1' });
    expect(p.items().map((f) => f.id)).toEqual(['z', 'a', 'b', 'c', 'd']);
  });

  it('si la página falla, la lista y el cursor quedan como estaban', async () => {
    const p = new PaginasPorCursor(
      signal({ items: filas('a'), siguienteCursor: 'c1' }),
      () => Promise.reject(new Error('caída')),
      (f) => f.id,
    );
    await expect(p.cargarMas()).rejects.toThrow('caída');
    expect(p.items().map((f) => f.id)).toEqual(['a']);
    expect(p.siguienteCursor()).toBe('c1');
    expect(p.cargandoMas()).toBe(false);
  });
});
