import { Observable, of, Subject } from 'rxjs';
import { reintentarCon401 } from './apollo';

type Contexto = Record<string, unknown>;

function operacion(inicial: Contexto = {}) {
  let contexto = { ...inicial };
  return {
    getContext: () => contexto,
    setContext: (c: Contexto) => (contexto = { ...contexto, ...c }),
  };
}

const no401 = Object.assign(new Error('Gateway caído'), { statusCode: 503 });
const vencido = Object.assign(new Error('Response not successful: Received status code 401'), { statusCode: 401 });

/** Llama al manejador con lo que le pasaría el ErrorLink de Apollo. */
function manejar(
  renovar: () => Promise<string | undefined>,
  error: unknown,
  op = operacion(),
  forward: () => Observable<unknown> = vi.fn(() => of({ data: { ok: true } })),
) {
  const r = reintentarCon401(renovar)({ error, operation: op, forward } as never);
  return { r: r as Observable<unknown> | undefined, op, forward };
}

describe('Apollo: reintento con 401 (spec 016)', () => {
  it('solo actúa con 401 y una sola vez por operación', () => {
    const renovar = vi.fn(async () => 'nuevo');
    expect(manejar(renovar, no401).r).toBeUndefined();
    expect(manejar(renovar, vencido, operacion({ reintentado: true })).r).toBeUndefined();
    expect(renovar).not.toHaveBeenCalled();
  });

  it('renueva el token y repite la operación con el token nuevo', async () => {
    const { r, op, forward } = manejar(async () => 'nuevo', vencido);
    const valores: unknown[] = [];
    await new Promise<void>((listo) => r!.subscribe({ next: (v) => valores.push(v), complete: listo }));
    expect(forward).toHaveBeenCalledTimes(1);
    expect(op.getContext()).toMatchObject({ reintentado: true, headers: { Authorization: 'Bearer nuevo' } });
    expect(valores).toEqual([{ data: { ok: true } }]);
  });

  it('sin token nuevo termina con el error original, no con una respuesta vacía', async () => {
    const { r, forward } = manejar(async () => undefined, vencido);
    const error = await new Promise((listo) => r!.subscribe({ error: listo, complete: () => listo('completó') }));
    expect(error).toBe(vencido);
    expect(forward).not.toHaveBeenCalled();
  });

  it('si la renovación falla, también termina con el error original', async () => {
    const { r } = manejar(() => Promise.reject(new Error('Keycloak caído')), vencido);
    await expect(new Promise((_, falla) => r!.subscribe({ error: falla }))).rejects.toBe(vencido);
  });

  it('cancelar antes de que vuelva la renovación no repite la operación', async () => {
    let devolver!: (t: string) => void;
    const { r, forward } = manejar(() => new Promise<string>((ok) => (devolver = ok)), vencido);
    r!.subscribe().unsubscribe();
    devolver('nuevo');
    await Promise.resolve();
    expect(forward).not.toHaveBeenCalled();
  });

  it('cancelar después cancela la repetición en curso', async () => {
    const repeticion = new Subject<unknown>();
    const { r } = manejar(
      async () => 'nuevo',
      vencido,
      operacion(),
      vi.fn(() => repeticion),
    );
    const suscripcion = r!.subscribe();
    await Promise.resolve();
    await Promise.resolve();
    expect(repeticion.observed).toBe(true);
    suscripcion.unsubscribe();
    expect(repeticion.observed).toBe(false);
  });
});
