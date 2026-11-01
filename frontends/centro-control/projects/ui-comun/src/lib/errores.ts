import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { mensajeCodigo, SIN_CONEXION } from 'ui-comun/dominio';

/** El `codigo` de 000 §5 que el Gateway pone en `extensions`: las pantallas deciden por él, no por el texto. */
export function codigoDe(error: unknown): string | undefined {
  if (CombinedGraphQLErrors.is(error)) return error.errors[0]?.extensions?.['codigo'] as string | undefined;
  return undefined;
}

/**
 * Lo que se dice en pantalla por un error (PRODUCT.md, "Tono"): la frase del `codigo` (ui-comun/dominio, errores.ts),
 * nunca el `message` del servidor. Sin respuesta GraphQL (red caída, Gateway sin responder), que no hay conexión.
 */
export function mensajeDe(error: unknown): string {
  return CombinedGraphQLErrors.is(error) ? mensajeCodigo(codigoDe(error)) : SIN_CONEXION;
}

/** Mientras no llega la primera respuesta, la página muestra el esqueleto (no "no hay datos"). */
export const cargandoDe = (resultado: { loading?: boolean; data?: unknown } | undefined | null): boolean =>
  !resultado || (!!resultado.loading && !resultado.data);

export function erroresGraphql(error: unknown) {
  return CombinedGraphQLErrors.is(error) ? error.errors : [];
}

/** ¿Algún error de la respuesta parcial tiene ese `codigo` en el `path` de ese campo? */
function errorEnCampo(error: unknown, campo: string, codigo: string): boolean {
  return erroresGraphql(error).some((e) => e.path?.includes(campo) && e.extensions?.['codigo'] === codigo);
}

/** Una consulta parcial con el campo en null porque su servicio cayó (por ejemplo, Finanzas en el tablero, FR2). */
export function servicioCaido(error: unknown, campo: string): boolean {
  return errorEnCampo(error, campo, 'DEPENDENCIA_NO_DISPONIBLE');
}

/** El campo salió en null porque el rol no lo puede ver (`@roles` del Gateway o el 403 del servicio dueño). */
export function sinPermiso(error: unknown, campo: string): boolean {
  return errorEnCampo(error, campo, 'SIN_PERMISO');
}

/**
 * Apollo 4 tipa los resultados con errorPolicy 'all' como parciales en profundidad. El Gateway anula campos enteros
 * (nunca deja objetos a medias), así que las pantallas los leen con el tipo completo y miran `null` donde corresponde.
 */
export function completo<T>(resultado: { data?: unknown } | undefined | null): T | undefined {
  return (resultado?.data ?? undefined) as T | undefined;
}

/**
 * La respuesta sin los errores de un campo opcional que la página ya explica por su cuenta (p. ej. `riesgo`: sin
 * predicción no es una falla, W3). Si no queda ninguno, `undefined`.
 */
export function sinErroresDe(error: unknown, campo: string): unknown {
  if (!CombinedGraphQLErrors.is(error)) return error;
  const resto = error.errors.filter((e) => !e.path?.includes(campo));
  if (resto.length === error.errors.length) return error;
  return resto.length ? new CombinedGraphQLErrors({ data: error.data, errors: resto }) : undefined;
}

/** Los índices de una lista cuyas filas salieron con ese campo en null por un error (`clientes[i].lineaCredito`, D-1). */
export function filasConError(error: unknown, lista: string, campo: string): Set<number> {
  const filas = erroresGraphql(error)
    .filter((e) => e.path?.[0] === lista && e.path.includes(campo) && typeof e.path[1] === 'number')
    .map((e) => e.path![1] as number);
  return new Set(filas);
}
