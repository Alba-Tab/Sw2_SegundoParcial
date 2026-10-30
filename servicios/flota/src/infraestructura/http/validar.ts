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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Idempotency-Key obligatoria y UUID (000 §4.1: la genera el cliente por intento). */
export function claveObligatoria(clave: string | undefined): string {
  if (!clave) throw new ErrorDeDominio('VALIDACION', 'Idempotency-Key: es obligatoria', { campo: 'Idempotency-Key' });
  if (!UUID.test(clave)) throw new ErrorDeDominio('VALIDACION', 'Idempotency-Key: debe ser un UUID', { campo: 'Idempotency-Key' });
  return clave;
}

/**
 * Los parámetros de consulta llegan como texto: `'true'` y `'false'` pasan a booleano antes de validar con el esquema
 * del contrato. Cualquier otro valor queda como texto y el esquema lo rechaza (400). No se usa z.coerce.boolean, que
 * convierte `'false'` en true.
 */
export function conBooleanos(q: unknown, campos: string[]): unknown {
  if (!q || typeof q !== 'object') return q;
  const r: Record<string, unknown> = { ...(q as Record<string, unknown>) };
  for (const c of campos) {
    if (r[c] === 'true') r[c] = true;
    else if (r[c] === 'false') r[c] = false;
  }
  return r;
}

/** Cursor opaco (000 §4): el último id de la página en base64url. */
export const aCursor = (id: string) => Buffer.from(id).toString('base64url');
export const desdeCursor = (c?: string) => (c ? Buffer.from(c, 'base64url').toString('utf8') : undefined);
