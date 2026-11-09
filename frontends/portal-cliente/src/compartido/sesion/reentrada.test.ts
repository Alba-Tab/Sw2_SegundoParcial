import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { volverAEntrar } from './reentrada';

describe('volverAEntrar', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/servicios/s1?pagina=2');
  });
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('olvida el usuario y vuelve a Keycloak con la página actual como state', async () => {
    const orden: string[] = [];
    const quitar = vi.fn(async () => void orden.push('quitar'));
    const redirigir = vi.fn(async (destino: string) => void orden.push(`ir ${destino}`));
    await volverAEntrar(quitar, redirigir, 1_000_000);
    expect(orden).toEqual(['quitar', 'ir /servicios/s1?pagina=2']);
  });

  it('varios 401 a la vez disparan una sola reentrada', async () => {
    let soltar = () => {};
    const quitar = vi.fn(() => new Promise<void>((r) => (soltar = r)));
    const redirigir = vi.fn(async () => {});
    const primera = volverAEntrar(quitar, redirigir, 1_000_000);
    await volverAEntrar(quitar, redirigir, 1_000_000);
    soltar();
    await primera;
    expect(quitar).toHaveBeenCalledTimes(1);
    expect(redirigir).toHaveBeenCalledTimes(1);
  });

  it('no redirige en ciclo: si vuelve a fallar antes de 30 s, solo olvida el usuario', async () => {
    const quitar = vi.fn(async () => {});
    const redirigir = vi.fn(async () => {});
    await volverAEntrar(quitar, redirigir, 1_000_000);
    await volverAEntrar(quitar, redirigir, 1_010_000);
    expect(quitar).toHaveBeenCalledTimes(2);
    expect(redirigir).toHaveBeenCalledTimes(1);
    await volverAEntrar(quitar, redirigir, 1_031_000);
    expect(redirigir).toHaveBeenCalledTimes(2);
  });
});
