import { ErrorDeUsuario } from '../dominio/errores';

/** El texto para el chofer: el de un `ErrorDeUsuario`, o uno genérico (el detalle técnico va al log, no a la pantalla). */
export function mensajeDe(e: unknown, generico = 'No se pudo guardar. Inténtalo de nuevo.'): string {
  if (e instanceof ErrorDeUsuario) return e.message;
  console.error(e);
  return generico;
}
