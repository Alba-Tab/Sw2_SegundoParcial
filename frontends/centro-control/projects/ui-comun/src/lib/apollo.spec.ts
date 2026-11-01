import { Observable, of, Subject } from 'rxjs';
import { opcionesApollo, pestanaOculta, ponerAlDia, reintentarCon401 } from './apollo';

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

describe('Apollo: sondeos con la pestaña oculta (R1F-9)', () => {
  it('los sondeos se saltan mientras la pestaña está oculta', () => {
    expect(opcionesApollo.watchQuery.skipPollAttempt).toBe(pestanaOculta);
    const visibilidad = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    expect(pestanaOculta()).toBe(true);
    visibilidad.mockReturnValue('visible');
    expect(pestanaOculta()).toBe(false);
    visibilidad.mockRestore();
  });

  it('R2F-8: al volver a la pestaña pide de nuevo solo las consultas con sondeo; oculta, ninguna', () => {
    const conSondeo = { options: { pollInterval: 15_000 }, refetch: vi.fn(async () => undefined) };
    const sinSondeo = { options: {}, refetch: vi.fn(async () => undefined) };
    const client = { getObservableQueries: () => new Set([conSondeo, sinSondeo]) };
    const visibilidad = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    ponerAlDia(client);
    expect(conSondeo.refetch).not.toHaveBeenCalled();
    visibilidad.mockReturnValue('visible');
    ponerAlDia(client);
    expect(conSondeo.refetch).toHaveBeenCalledTimes(1);
    expect(sinSondeo.refetch).not.toHaveBeenCalled();
    visibilidad.mockRestore();
  });
});

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

/**
 * Las fachadas recargan con `refetch` del mismo `watch` (V4-1): cuando resuelve la promesa, la señal que alimenta la
 * página ya tiene la respuesta nueva. Un `client.query` aparte resolvía antes de que el `watch` emitiera, y el aviso de
 * PAGO_EXCEDE_SALDO decía el saldo viejo. Por eso se mira justo después del `await`, sin esperar otra tarea.
 */
describe('Apollo: recargar con refetch del mismo watch (V4-1)', () => {
  async function montar(
    respuesta: () => Observable<{
      data: Record<string, unknown> | null;
      errors?: { message: string; path?: string[]; extensions?: Record<string, unknown> }[];
    }>,
  ) {
    const { ApolloClient, ApolloLink: Link, InMemoryCache, gql } = await import('@apollo/client/core');
    const client = new ApolloClient({
      link: new Link(respuesta),
      cache: new InMemoryCache(),
      defaultOptions: opcionesApollo,
    });
    const consulta = client.watchQuery({
      // Como `Factura` del Gateway: sin `id`, así la caché no la normaliza (V4-1).
      query: gql`
        query Factura {
          factura {
            numero
            saldo
          }
        }
      `,
    });
    const vistos: { data: unknown; error: unknown; loading?: boolean }[] = [];
    const sub = consulta.subscribe((r) => vistos.push({ data: r.data, error: r.error, loading: r.loading }));
    await new Promise((ok) => setTimeout(ok));
    return { consulta, vistos, sub };
  }
  const factura = (saldo: string) => ({ data: { factura: { __typename: 'Factura', numero: 'F-1', saldo } } });

  it('al resolver, el watch ya tiene el saldo nuevo', async () => {
    let saldo = '10.00';
    const { consulta, vistos, sub } = await montar(() => of(factura(saldo)));
    expect(vistos.at(-1)?.data).toEqual(factura('10.00').data);
    saldo = '5.00';
    await consulta.refetch();
    expect(vistos.at(-1)?.data).toEqual(factura('5.00').data);
    sub.unsubscribe();
  });

  it('después de un fallo sin datos, al resolver ya no queda el error', async () => {
    let falla = true;
    const { consulta, vistos, sub } = await montar(() =>
      falla ? new Observable<{ data: Record<string, unknown> }>((o) => o.error(new Error('Gateway caído'))) : of(factura('10.00')),
    );
    expect(vistos.at(-1)?.error).toBeTruthy();
    falla = false;
    await consulta.refetch();
    expect(vistos.at(-1)).toMatchObject({ data: factura('10.00').data, error: undefined });
    sub.unsubscribe();
  });

  // V6-2: el aviso sale de `error`; si el refetch o el sondeo emitieran `{ loading: true, error: undefined }`, el banner
  // y su «Reintentar» desaparecerían (foco a <body>) y el `role="alert"` se volvería a anunciar en cada sondeo.
  // Asíncrona, como la red: con una respuesta síncrona Apollo no llega a emitir el estado de carga.
  const parcial = () =>
    new Observable<{ data: Record<string, unknown>; errors: { message: string; path: string[]; extensions: Record<string, unknown> }[] }>(
      (o) => {
        setTimeout(() => {
          o.next({
            data: { factura: null },
            errors: [{ message: 'Finanzas no disponible', path: ['factura'], extensions: { codigo: 'DEPENDENCIA_NO_DISPONIBLE' } }],
          });
          o.complete();
        });
      },
    );

  it('con datos parciales, el refetch no borra el error mientras dura', async () => {
    const { consulta, vistos, sub } = await montar(parcial);
    expect(vistos.at(-1)?.error).toBeTruthy();
    const desde = vistos.length;
    await consulta.refetch();
    expect(vistos.slice(desde).every((v) => v.error && !v.loading)).toBe(true);
    sub.unsubscribe();
  });

  it('con datos parciales, el sondeo no vuelve a emitir el estado de carga', async () => {
    const { consulta, vistos, sub } = await montar(parcial);
    const desde = vistos.length;
    consulta.startPolling(5);
    await new Promise((ok) => setTimeout(ok, 40));
    consulta.stopPolling();
    expect(vistos.slice(desde).every((v) => v.error && !v.loading)).toBe(true);
    sub.unsubscribe();
  });
});
