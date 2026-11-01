import { signal } from '@angular/core';
import { PaginasCursor, type PaginaCursor } from './paginas-cursor';

describe('PaginasCursor (E5-1)', () => {
  it('agrega la página siguiente al final y deja de ofrecer más en la última', async () => {
    const primera = signal<PaginaCursor<string> | undefined>({ items: ['a', 'b'], siguienteCursor: 'c1' });
    const pedir = vi.fn(async (c: string) =>
      c === 'c1' ? { items: ['c'], siguienteCursor: 'c2' } : { items: ['d'], siguienteCursor: null },
    );
    const p = new PaginasCursor(primera, pedir);
    expect(p.siguienteCursor()).toBe('c1');
    await p.cargarMas();
    await p.cargarMas();
    expect(p.items()).toEqual(['a', 'b', 'c', 'd']);
    expect(p.siguienteCursor()).toBeNull();
    await p.cargarMas();
    expect(pedir).toHaveBeenCalledTimes(2);
    // El sondeo cambia la primera página; las agregadas siguen.
    primera.set({ items: ['a2', 'b'], siguienteCursor: 'c1' });
    expect(p.items()).toEqual(['a2', 'b', 'c', 'd']);
  });

  it('si la página siguiente falla, lanza y no cambia lo mostrado', async () => {
    const p = new PaginasCursor(
      () => ({ items: ['a'], siguienteCursor: 'c1' }),
      () => Promise.reject(new Error('sin red')),
    );
    await expect(p.cargarMas()).rejects.toThrow('sin red');
    expect(p.items()).toEqual(['a']);
    expect(p.cargandoMas()).toBe(false);
    expect(p.siguienteCursor()).toBe('c1');
  });
});
