import { CombinedGraphQLErrors } from '@apollo/client/errors';

/** El `codigo` de 000 §5 que el Gateway pone en `extensions`: las pantallas deciden por él, no por el texto. */
export function codigoDe(error: unknown): string | undefined {
  if (CombinedGraphQLErrors.is(error)) return error.errors[0]?.extensions?.['codigo'] as string | undefined;
  return undefined;
}

const MENSAJES: Record<string, string> = {
  SIN_PERMISO: 'No tienes permiso para esta operación',
  CONFLICTO_ESTADO: 'El estado cambió; actualiza la pantalla',
  DEPENDENCIA_NO_DISPONIBLE: 'Un servicio no está disponible; intenta en unos segundos',
  VALIDACION: 'Revisa los datos',
  IDEMPOTENCIA_CUERPO_DISTINTO: 'Esa operación ya se registró con otros datos',
};

export function mensajeDe(error: unknown): string {
  if (CombinedGraphQLErrors.is(error)) {
    const e = error.errors[0];
    const codigo = e?.extensions?.['codigo'] as string | undefined;
    return e?.message || (codigo && MENSAJES[codigo]) || 'No se pudo completar la operación';
  }
  return error instanceof Error ? error.message : 'No se pudo completar la operación';
}

export function erroresGraphql(error: unknown) {
  return CombinedGraphQLErrors.is(error) ? error.errors : [];
}

/** Una consulta parcial con el campo en null porque su servicio cayó (por ejemplo, Finanzas en el tablero, FR2). */
export function servicioCaido(error: unknown, campo: string): boolean {
  return erroresGraphql(error).some((e) => e.path?.includes(campo) && e.extensions?.['codigo'] === 'DEPENDENCIA_NO_DISPONIBLE');
}

/**
 * Apollo 4 tipa los resultados con errorPolicy 'all' como parciales en profundidad. El Gateway anula campos enteros
 * (nunca deja objetos a medias), así que las pantallas los leen con el tipo completo y miran `null` donde corresponde.
 */
export function completo<T>(resultado: { data?: unknown } | undefined | null): T | undefined {
  return (resultado?.data ?? undefined) as T | undefined;
}
