import { ErrorDeDominio } from '../comun/error-de-dominio';

/**
 * Reserva de tracto, remolque y chofer para un servicio (spec 003, D11). PROVISIONAL (paso 3) → CONFIRMADA (paso 5)
 * o LIBERADA. Una reserva LIBERADA sin unidades es una lápida: la compensación llegó antes que la reserva, y una
 * reserva tardía del mismo servicio ya no toma unidades.
 */
export type EstadoReserva = 'PROVISIONAL' | 'CONFIRMADA' | 'LIBERADA';

export interface ReservaUnidad {
  reservaUnidadId: string;
  servicioId: string;
  viajeId?: string;
  tractoId?: string;
  remolqueId?: string;
  choferId?: string;
  estado: EstadoReserva;
  creadaEn: Date;
}

export function confirmar(r: ReservaUnidad): ReservaUnidad {
  if (r.estado === 'LIBERADA') throw new ErrorDeDominio('CONFLICTO_ESTADO', 'La reserva ya se liberó');
  return { ...r, estado: 'CONFIRMADA' };
}

/** Las unidades y el chofer que hay que devolver; vacío si ya estaba liberada o es una lápida. */
export function aLiberar(r: ReservaUnidad): { unidades: string[]; choferId?: string } {
  if (r.estado === 'LIBERADA') return { unidades: [] };
  return { unidades: [r.tractoId, r.remolqueId].filter((u): u is string => !!u), choferId: r.choferId };
}
