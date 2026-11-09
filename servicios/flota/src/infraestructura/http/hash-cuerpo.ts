import { createHash } from 'node:crypto';
import type { Usuario } from './autenticacion.middleware';

/** Lo que el hash toma de la petición HTTP: método, ruta con sus ids y el usuario del token. */
export interface PeticionHttp {
  method: string;
  originalUrl: string;
  usuario: Usuario;
}

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

/**
 * SHA-256 de la petición para la idempotencia (000 §4.1): `MÉTODO ruta`, el `sub` del token y el cuerpo con las llaves
 * ordenadas (espacios u orden de campos no cambian el hash). Igual que Viajes: la misma Idempotency-Key en otro recurso o
 * enviada por otro usuario no coincide y responde 422 IDEMPOTENCIA_CUERPO_DISTINTO, en vez de devolver la respuesta
 * guardada de la primera petición. La ruta va sin la consulta (`?…`).
 */
export function hashPeticion(req: PeticionHttp, cuerpo: unknown): string {
  const ruta = req.originalUrl.split('?')[0];
  return createHash('sha256')
    .update(`${req.method.toUpperCase()} ${ruta}\n${req.usuario.sub}\n`)
    .update(JSON.stringify(ordenar(cuerpo)))
    .digest('hex');
}
