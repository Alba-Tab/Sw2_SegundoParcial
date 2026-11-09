/** Autoridad de idempotencia de Flota (000 §4.1): una operación por Idempotency-Key, en la transacción del cambio. */
export interface OperacionIdempotente {
  clave: string;
  /** Operación y recurso, p. ej. `actualizarUnidad:<unidadId>`. */
  operacion: string;
  hashCuerpo: string;
  respuesta: unknown;
}

export interface OperacionesIdempotentes {
  buscar(clave: string): Promise<OperacionIdempotente | null>;
  guardar(op: OperacionIdempotente): Promise<void>;
}
export const OPERACIONES_IDEMPOTENTES = Symbol('OperacionesIdempotentes');
