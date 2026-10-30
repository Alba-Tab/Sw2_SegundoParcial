import { createHash } from 'node:crypto';

/** SHA-256 del cuerpo con las llaves ordenadas (000 §4.1): espacios u orden de campos no cambian el hash. */
export function hashCuerpo(cuerpo: unknown): string {
  const ordenar = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(ordenar)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, ordenar(x)]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(ordenar(cuerpo)))
    .digest('hex');
}
