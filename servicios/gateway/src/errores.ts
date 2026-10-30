import { GraphQLError } from 'graphql';

/** Error de GraphQL con el código y el status de 000 §5 en `extensions` (la app decide por `codigo`). */
export function errorGraphql(codigo: string, mensaje: string, status: number, extra: Record<string, unknown> = {}): GraphQLError {
  return new GraphQLError(mensaje, { extensions: { codigo, status, ...extra } });
}

export const sinPermiso = (mensaje = 'Tu rol no tiene acceso a este dato') => errorGraphql('SIN_PERMISO', mensaje, 403);
