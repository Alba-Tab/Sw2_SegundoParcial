import type { Contexto } from '../autenticacion';
import { ESPERA, rutaRest, type ClienteServicios, type RutaRest } from '../servicios';
import * as m from './mapeos';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Un campo opcional de GraphQL puede llegar en `null`; el contrato REST de Flota lo espera ausente. */
const sinNulos = (o: Json): Json => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

/**
 * Gestión de unidades y choferes desde el Centro de Control (D104): el Gateway solo reenvía a Flota, con
 * `claveIdempotencia` como `Idempotency-Key`, y devuelve el recurso que Flota responde. Las reglas (atributos por tipo,
 * motivo al inhabilitar, reserva activa) las aplica Flota.
 */
export function resolversGestionFlota(s: ClienteServicios) {
  const put = (ctx: Contexto, ruta: RutaRest, cuerpo: Json, clave: string) =>
    s.llamar<Json>(ctx, 'flota', 'PUT', ruta, { cuerpo, clave, tiempoMs: ESPERA.mutacion });

  return {
    Query: {
      chofer: (_: unknown, { id }: Args, ctx: Contexto) => s.get<Json>(ctx, 'flota', rutaRest`/api/v1/choferes/${id}`),
    },
    Chofer: {
      motivoInhabilitacion: (c: Json) => c['inhabilitacion']?.['motivo'] ?? null,
    },
    Mutation: {
      crearUnidad: async (_: unknown, { input }: Args, ctx: Contexto) => {
        const { claveIdempotencia, ...cuerpo } = input;
        return m.unidad(
          await s.post<Json>(ctx, 'flota', rutaRest`/api/v1/unidades`, { cuerpo: sinNulos(cuerpo), clave: claveIdempotencia }),
        );
      },
      editarUnidad: async (_: unknown, { input }: Args, ctx: Contexto) => {
        const { unidadId, claveIdempotencia, ...cuerpo } = input;
        return m.unidad(await put(ctx, rutaRest`/api/v1/unidades/${unidadId}`, sinNulos(cuerpo), claveIdempotencia));
      },
      darDeBajaUnidad: async (_: unknown, { unidadId, motivo, claveIdempotencia }: Args, ctx: Contexto) =>
        m.unidad(
          await s.post<Json>(ctx, 'flota', rutaRest`/api/v1/unidades/${unidadId}/baja`, { cuerpo: { motivo }, clave: claveIdempotencia }),
        ),
      editarChofer: (_: unknown, { input }: Args, ctx: Contexto) => {
        const { choferId, claveIdempotencia, ...cuerpo } = input;
        return put(ctx, rutaRest`/api/v1/choferes/${choferId}`, cuerpo, claveIdempotencia);
      },
      cambiarHabilitacionChofer: (_: unknown, { choferId, activo, motivo, claveIdempotencia }: Args, ctx: Contexto) =>
        s.post<Json>(ctx, 'flota', rutaRest`/api/v1/choferes/${choferId}/habilitacion`, {
          cuerpo: sinNulos({ activo, motivo }),
          clave: claveIdempotencia,
        }),
    },
  };
}
