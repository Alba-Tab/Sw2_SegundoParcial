import type { Contexto } from '../autenticacion';
import { ESPERA, rutaRest, type ClienteServicios } from '../servicios';
import * as m from './mapeos';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** La clave del input viaja como Idempotency-Key; el resto es el cuerpo (contratos/openapi/viajes.yaml). */
const escritura = ({ claveIdempotencia, ...cuerpo }: Json) => ({ cuerpo, clave: claveIdempotencia, tiempoMs: ESPERA.mutacion });

/**
 * Datos maestros de Viajes desde el Centro de Control (D104): lecturas por id para las fichas, alta y edición de rutas
 * (G4) y edición de clientes (G7). Viajes valida, decide la idempotencia y publica el evento; aquí solo se traduce.
 */
export function resolversGestionViajes(s: ClienteServicios) {
  return {
    Query: {
      cliente: (_: unknown, { id }: Args, ctx: Contexto) => s.get<Json>(ctx, 'viajes', rutaRest`/api/v1/clientes/${id}`),
      ruta: async (_: unknown, { id }: Args, ctx: Contexto) => m.ruta(await s.get<Json>(ctx, 'viajes', rutaRest`/api/v1/rutas/${id}`)),
    },
    Mutation: {
      crearRuta: async (_: unknown, { input }: Args, ctx: Contexto) =>
        m.ruta(await s.post<Json>(ctx, 'viajes', rutaRest`/api/v1/rutas`, escritura(input))),
      editarRuta: async (_: unknown, { rutaId, input }: Args, ctx: Contexto) =>
        m.ruta(await s.llamar<Json>(ctx, 'viajes', 'PUT', rutaRest`/api/v1/rutas/${rutaId}`, escritura(input))),
      editarCliente: (_: unknown, { clienteId, input }: Args, ctx: Contexto) =>
        s.llamar<Json>(ctx, 'viajes', 'PUT', rutaRest`/api/v1/clientes/${clienteId}`, escritura(input)),
    },
  };
}
