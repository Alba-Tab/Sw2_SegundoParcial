import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import type { OperacionesIdempotentes } from '../puertos/operaciones-idempotentes';

/**
 * 000 §4.1, dentro de la transacción del caso de uso: la misma clave con la misma operación y cuerpo devuelve la respuesta
 * guardada; con otra, 422 IDEMPOTENCIA_CUERPO_DISTINTO. Un error de negocio no se guarda (la transacción se revierte) y
 * el reenvío vuelve a evaluar. Dos peticiones simultáneas chocan en la transacción y la segunda lee la respuesta.
 */
export async function conIdempotencia<T>(
  operaciones: OperacionesIdempotentes,
  op: { clave: string; operacion: string; hashCuerpo: string },
  trabajo: () => Promise<T>,
): Promise<T> {
  const previa = await operaciones.buscar(op.clave);
  if (previa) {
    if (previa.operacion !== op.operacion || previa.hashCuerpo !== op.hashCuerpo) {
      throw new ErrorDeDominio('IDEMPOTENCIA_CUERPO_DISTINTO', 'Esa Idempotency-Key ya se usó con otra petición');
    }
    return previa.respuesta as T;
  }
  const respuesta = await trabajo();
  await operaciones.guardar({ ...op, respuesta });
  return respuesta;
}

export interface Peticion<E> {
  usuario: { sub: string; roles: string[] };
  clave: string;
  hashCuerpo: string;
  cuerpo: E;
}

/** Spec 010: solo el jefe de flota escribe unidades y mantenimientos. */
export function soloJefeFlota(roles: string[]): void {
  if (!roles.includes('jefe_flota')) throw new ErrorDeDominio('SIN_PERMISO', 'Solo el jefe de flota gestiona unidades y mantenimientos');
}
