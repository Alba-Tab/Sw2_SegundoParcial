import type { Contexto } from '../autenticacion';
import type { Cargadores } from './cargadores';
import { ESPERA, rutaRest, type ClienteServicios } from '../servicios';
import * as m from './mapeos';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctx = Contexto & { cargadores: Cargadores };

/** La razón social por el DataLoader de clientes: un cliente que ya no existe sale en null, no como error de la fila. */
const razonSocial = (fila: Json, __: Args, ctx: Ctx) =>
  ctx.cargadores.cliente.load(fila['clienteId']).then((c) => c?.['razonSocial'] ?? null);

/** La clave del input viaja como Idempotency-Key; el resto es el cuerpo (contratos/openapi/viajes.yaml). */
const escritura = ({ claveIdempotencia, ...cuerpo }: Json) => ({ cuerpo, clave: claveIdempotencia, tiempoMs: ESPERA.mutacion });

/**
 * Datos maestros de Viajes desde el Centro de Control (D104): lecturas por id para las fichas, alta y edición de rutas
 * (G4) y edición de clientes (G7). Viajes valida, decide la idempotencia y publica el evento; aquí solo se traduce.
 */
export function resolversGestionViajes(s: ClienteServicios) {
  return {
    /** E5-1: una página de Viajes tal cual, con su cursor opaco (000 §4). */
    clientes: async (ctx: Contexto, limite: number, despuesDe?: string | null) => {
      const r = await s.get<Json>(ctx, 'viajes', rutaRest`/api/v1/clientes`, { query: { limite, cursor: despuesDe } });
      return m.pagina(r, (c) => c);
    },
    Servicio: { razonSocial },
    Cotizacion: { razonSocial },
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
