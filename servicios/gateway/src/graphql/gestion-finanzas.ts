import type { Contexto } from '../autenticacion';
import { validacion } from '../errores';
import { rutaRest, type ClienteServicios } from '../servicios';
import * as m from './mapeos';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * G6 (spec 012): ajuste y suspensión de la línea de crédito. Finanzas responde la línea actualizada (contrato), así
 * que no se relee; la regla (límite ≥ lo usado, el rol, el motivo) la decide Finanzas.
 */
export function mutacionesLineaCredito(s: ClienteServicios) {
  return {
    ajustarLineaCredito: async (_: unknown, { clienteId, limite, motivo, claveIdempotencia }: Args, ctx: Contexto) =>
      m.lineaCredito(
        await s.put<Json>(ctx, 'finanzas', rutaRest`/api/v1/lineas-credito/${clienteId}`, {
          cuerpo: { limite: { monto: limite, moneda: 'BOB' }, motivo },
          clave: claveIdempotencia,
        }),
      ),
    cambiarEstadoLineaCredito: async (_: unknown, { clienteId, suspendida, motivo, claveIdempotencia }: Args, ctx: Contexto) =>
      m.lineaCredito(
        await s.post<Json>(ctx, 'finanzas', rutaRest`/api/v1/lineas-credito/${clienteId}/estado`, {
          cuerpo: { suspendida, motivo },
          clave: claveIdempotencia,
        }),
      ),
  };
}

/** `maxItems` de `clienteIds` en `listarLineasCredito` (contratos/openapi/finanzas.yaml). */
export const LOTE_LINEAS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * B5: lote del DataLoader `lineaCredito`, hasta 100 clientes en una llamada a Finanzas. Un cliente sin línea es null; un
 * id que no es UUID es VALIDACION solo para él (no se manda: haría fallar el lote entero). Si Finanzas falla, fallan
 * todas las del lote, cada una con su error.
 */
export async function lineasPorLote(s: ClienteServicios, ctx: Contexto, ids: readonly string[]): Promise<(Json | null | Error)[]> {
  const validos = [...new Set(ids.filter((id) => UUID.test(id)).map((id) => id.toLowerCase()))];
  const r = validos.length
    ? await s.get<Json>(ctx, 'finanzas', rutaRest`/api/v1/lineas-credito`, { query: { clienteIds: validos.join(',') } })
    : undefined;
  const porId = new Map(m.items(r).map((l) => [String(l['clienteId']).toLowerCase(), m.lineaCredito(l)]));
  return ids.map((id) =>
    UUID.test(id) ? (porId.get(id.toLowerCase()) ?? null) : validacion('El identificador no es válido', { valor: id.slice(0, 64) }),
  );
}
