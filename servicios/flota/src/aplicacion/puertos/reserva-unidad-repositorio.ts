import type { ReservaUnidad } from '../../dominio/reserva/reserva-unidad';

export interface ReservaUnidadRepositorio {
  porServicio(servicioId: string): Promise<ReservaUnidad | null>;
  /** Índice único por servicioId: dos reservas del mismo servicio no pueden existir. */
  insertar(reserva: ReservaUnidad): Promise<void>;
  actualizar(reserva: ReservaUnidad): Promise<void>;
}
export const RESERVA_UNIDAD_REPOSITORIO = Symbol('ReservaUnidadRepositorio');
