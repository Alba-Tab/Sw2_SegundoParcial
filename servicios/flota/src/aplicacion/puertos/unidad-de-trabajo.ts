/** Ejecuta un caso de uso en una transacción: los cambios y el Outbox se confirman juntos o no se confirman. */
export interface UnidadDeTrabajo {
  ejecutar<T>(trabajo: () => Promise<T>): Promise<T>;
}
export const UNIDAD_DE_TRABAJO = Symbol('UnidadDeTrabajo');
