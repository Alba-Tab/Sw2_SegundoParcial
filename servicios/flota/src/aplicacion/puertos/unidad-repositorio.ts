import type { Unidad } from '../../dominio/unidad/unidad';

export interface UnidadRepositorio {
  porId(unidadId: string): Promise<Unidad | null>;
  porPlaca(placa: string): Promise<Unidad | null>;
  /** Tractos y remolques en DISPONIBLE (la saga filtra después por documentos, tipo y capacidad). */
  disponibles(): Promise<Unidad[]>;
  /** Actualización condicional DISPONIBLE → RESERVADA, releyendo el estado en la misma operación (spec 003). */
  tomar(unidadId: string): Promise<boolean>;
  /** RESERVADA → DISPONIBLE; no toca una unidad que ya cambió de estado. */
  devolver(unidadId: string): Promise<void>;
  /** RESERVADA → EN_VIAJE (D20); no toca una unidad que ya cambió de estado. */
  ponerEnViaje(unidadId: string): Promise<void>;
  /** Alta (spec 010); la placa es única por índice. */
  insertar(unidad: Unidad): Promise<void>;
  /** Reemplaza el documento (estado, km, documentos, atributos) dentro de la transacción en curso. */
  guardar(unidad: Unidad): Promise<void>;
  listar(filtro: { placa?: string; tipo?: string; estado?: string }, despuesDe: string | undefined, limite: number): Promise<Unidad[]>;
}
export const UNIDAD_REPOSITORIO = Symbol('UnidadRepositorio');
