import type { z } from 'zod';
import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';

/** Valida contra el esquema zod generado del contrato; el primer error va como `campo` (000 §5). */
export function validar<S extends z.ZodTypeAny>(esquema: S, valor: unknown): z.infer<S> {
  const r = esquema.safeParse(valor);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new ErrorDeDominio('VALIDACION', `${i.path.join('.')}: ${i.message}`, { campo: i.path.join('.') });
  }
  return r.data;
}

export function claveObligatoria(clave: string | undefined): string {
  if (!clave) throw new ErrorDeDominio('VALIDACION', 'Idempotency-Key: es obligatoria', { campo: 'Idempotency-Key' });
  return clave;
}

/** Cursor opaco (000 §4): el último id de la página en base64url. */
export const aCursor = (id: string) => Buffer.from(id).toString('base64url');
export const desdeCursor = (c?: string) => (c ? Buffer.from(c, 'base64url').toString('utf8') : undefined);
