/** Finanzas falso para probar el cliente REST sin Nest ni Keycloak: un `fetch` que responde lo que diga cada prueba. */
import { GraphQLError } from 'graphql';
import type { Contexto } from '../src/autenticacion';
import { ClienteServicios } from '../src/servicios';

export interface Pedido {
  metodo: string;
  url: URL;
  cabeceras: Record<string, string>;
  cuerpo: unknown;
}

export const CTX: Contexto = {
  usuario: { sub: 'u1', roles: ['administracion'], token: 'token-usuario', venceMs: Date.now() + 60_000 },
  correlationId: 'c1',
  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
};
export const C1 = '01933b5a-1f00-7a20-8b11-0c2d3e4f5a01';
export const C2 = '01933b5a-1f00-7a20-8b11-0c2d3e4f5a02';
export const linea = (clienteId: string, extra: Record<string, unknown> = {}) => ({
  clienteId,
  limite: { monto: '30000.00', moneda: 'BOB' },
  reservado: { monto: '0.00', moneda: 'BOB' },
  utilizado: { monto: '0.00', moneda: 'BOB' },
  disponible: { monto: '30000.00', moneda: 'BOB' },
  enMora: false,
  suspendida: false,
  ...extra,
});

/** Un ClienteServicios cuyo Finanzas responde con `responder`; guarda cada pedido. */
export function finanzas(responder: (p: Pedido) => { status: number; json?: unknown; texto?: string }) {
  const pedidos: Pedido[] = [];
  const fetchFn = (async (url: URL, init: RequestInit) => {
    const p = {
      metodo: String(init.method),
      url,
      cabeceras: init.headers as Record<string, string>,
      cuerpo: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    pedidos.push(p);
    const r = responder(p);
    return new Response(r.texto ?? JSON.stringify(r.json ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const intercambio = { tokenPara: async () => 'token-finanzas', tokenDeServicio: async () => 'token-servicio' };
  const urls = { viajesUrl: 'http://viajes', flotaUrl: 'http://flota', finanzasUrl: 'http://finanzas', analiticaUrl: 'http://analitica' };
  return { s: new ClienteServicios(intercambio, urls, fetchFn), pedidos };
}

export async function errorDe(p: Promise<unknown>): Promise<GraphQLError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof GraphQLError) return e;
    throw e;
  }
  throw new Error('No falló');
}
