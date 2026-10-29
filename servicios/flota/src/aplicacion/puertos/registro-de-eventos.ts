/**
 * Deja un evento para publicar dentro de la transacción en curso (Outbox, 000 §6). Fuera de una UnidadDeTrabajo falla.
 * Nunca publica directo al broker.
 */
export interface RegistroDeEventos {
  registrar(tipo: string, claveEnrutamiento: string, datos: unknown): Promise<void>;
}
export const REGISTRO_DE_EVENTOS = Symbol('RegistroDeEventos');
