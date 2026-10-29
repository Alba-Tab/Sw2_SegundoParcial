import { AsyncLocalStorage } from 'node:async_hooks';

/** Datos de la petición en curso que van a los logs y al sobre de los eventos. */
export interface Contexto {
  correlationId: string;
}
export const contexto = new AsyncLocalStorage<Contexto>();
