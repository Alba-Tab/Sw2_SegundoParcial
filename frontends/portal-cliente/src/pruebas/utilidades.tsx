import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

export interface Llamada {
  metodo: string;
  url: string;
  encabezados: Headers;
  cuerpo: unknown;
}

type Respuesta = { estado: number; cuerpo?: unknown; encabezados?: Record<string, string> };

/**
 * Reemplaza fetch: cada petición se resuelve con la primera respuesta en cola para `MÉTODO ruta` (o la última, si
 * solo queda una) y queda registrada en `llamadas`.
 */
export function simularApi(rutas: Record<string, Respuesta | Respuesta[]>) {
  const llamadas: Llamada[] = [];
  const colas = Object.fromEntries(Object.entries(rutas).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: string, init?: RequestInit) => {
      const url = new URL(entrada);
      const metodo = init?.method ?? 'GET';
      llamadas.push({
        metodo,
        url: url.pathname,
        encabezados: new Headers(init?.headers),
        cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      const cola = colas[`${metodo} ${url.pathname}`];
      if (!cola) throw new Error(`Sin respuesta simulada para ${metodo} ${url.pathname}`);
      const r = cola.length > 1 ? cola.shift()! : cola[0];
      return new Response(r.cuerpo === undefined ? null : JSON.stringify(r.cuerpo), {
        status: r.estado,
        headers: { 'content-type': r.estado < 300 ? 'application/json' : 'application/problem+json', ...r.encabezados },
      });
    }),
  );
  return llamadas;
}

export function conConsultas(ui: ReactElement) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={consultas}>{ui}</QueryClientProvider>);
}

export const problema = (estado: number, codigo: string, extra: object = {}) => ({
  type: `https://transporte.local/errores/${codigo.toLowerCase()}`,
  title: codigo,
  status: estado,
  detail: codigo,
  codigo,
  ...extra,
});
