import type { Unidad } from '../../dominio/unidad/unidad';

export interface UnidadRepositorio {
  porId(unidadId: string): Promise<Unidad | null>;
  /** Tractos y remolques en DISPONIBLE (la saga filtra después por documentos, tipo y capacidad). */
  disponibles(): Promise<Unidad[]>;
  /** Actualización condicional DISPONIBLE → RESERVADA, releyendo el estado en la misma operación (spec 003). */
  tomar(unidadId: string): Promise<boolean>;
  /** RESERVADA → DISPONIBLE; no toca una unidad que ya cambió de estado. */
  devolver(unidadId: string): Promise<void>;
}
export const UNIDAD_REPOSITORIO = Symbol('UnidadRepositorio');
