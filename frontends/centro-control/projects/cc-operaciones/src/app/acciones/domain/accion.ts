import type { AccionesQuery } from '../../graphql/generado';

/** CU-18 (spec 014): acción que el agente propone y el despachador decide. */
export type Accion = NonNullable<AccionesQuery['accionesPropuestas']>[number];

/** La acción abierta desde una alerta (`/acciones/:id`) va primero; las demás conservan su orden. */
export function conLaElegidaPrimero<T extends { accionId: string }>(todas: T[], id: string | undefined): T[] {
  return id ? [...todas.filter((a) => a.accionId === id), ...todas.filter((a) => a.accionId !== id)] : todas;
}
