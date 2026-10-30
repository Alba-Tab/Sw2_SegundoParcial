import { GraphQLError } from 'graphql';

/** Error de GraphQL con el código y el status de 000 §5 en `extensions` (la app decide por `codigo`). */
export function errorGraphql(codigo: string, mensaje: string, status: number, extra: Record<string, unknown> = {}): GraphQLError {
  return new GraphQLError(mensaje, { extensions: { codigo, status, ...extra } });
}

export const sinPermiso = (mensaje = 'Tu rol no tiene acceso a este dato') => errorGraphql('SIN_PERMISO', mensaje, 403);

export const validacion = (mensaje: string, extra: Record<string, unknown> = {}) => errorGraphql('VALIDACION', mensaje, 400, extra);

/** `type` de Problem Details (000 §5): el código en minúsculas con guiones, igual en todas las respuestas. */
export const tipoProblema = (codigo: string) => `https://transporte.local/errores/${codigo.toLowerCase().replace(/_/g, '-')}`;

/** Cuerpo `application/problem+json` (RFC 9457) con el `codigo` estable de 000 §5. */
export const cuerpoProblema = (status: number, codigo: string, detail: string) => ({
  type: tipoProblema(codigo),
  title: codigo,
  status,
  codigo,
  detail,
});
