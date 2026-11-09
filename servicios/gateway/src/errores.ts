import { GraphQLError } from 'graphql';

/** Error de GraphQL con el código y el status de 000 §5 en `extensions` (la app decide por `codigo`). */
export function errorGraphql(codigo: string, mensaje: string, status: number, extra: Record<string, unknown> = {}): GraphQLError {
  return new GraphQLError(mensaje, { extensions: { codigo, status, ...extra } });
}

export const sinPermiso = (mensaje = 'Tu rol no tiene acceso a este dato') => errorGraphql('SIN_PERMISO', mensaje, 403);

export const validacion = (mensaje: string, extra: Record<string, unknown> = {}) => errorGraphql('VALIDACION', mensaje, 400, extra);

/** El código de 000 §5 que corresponde a un status HTTP, cuando la respuesta no trae el suyo. */
export function codigoPorStatus(status: number): string {
  if (status === 401) return 'NO_AUTENTICADO';
  if (status === 403) return 'SIN_PERMISO';
  if (status === 404) return 'NO_ENCONTRADO';
  if (status === 409) return 'CONFLICTO_ESTADO';
  if (status === 429) return 'LIMITE_PETICIONES';
  if (status === 503) return 'DEPENDENCIA_NO_DISPONIBLE';
  return status >= 400 && status < 500 ? 'VALIDACION' : 'ERROR_INTERNO';
}

/** `type` de Problem Details (000 §5): el código en minúsculas con guiones, igual en todas las respuestas. */
export const tipoProblema = (codigo: string) => `https://transporte.local/errores/${codigo.toLowerCase().replace(/_/g, '-')}`;

/** `title` para personas (000 §5): el `codigo` es para la app, no para mostrarlo. */
const TITULOS: Record<string, string> = {
  VALIDACION: 'La petición no es válida',
  NO_AUTENTICADO: 'No autenticado',
  SIN_PERMISO: 'Sin permiso',
  NO_ENCONTRADO: 'No encontrado',
  CONFLICTO_ESTADO: 'Conflicto de estado',
  LIMITE_PETICIONES: 'Demasiadas peticiones',
  EXPORTACION_VENCIDA: 'El enlace venció',
  DEPENDENCIA_NO_DISPONIBLE: 'Servicio no disponible',
  ERROR_INTERNO: 'Error interno',
};

export const tituloProblema = (codigo: string) => TITULOS[codigo] ?? 'No se pudo atender la petición';

/** Cuerpo `application/problem+json` (RFC 9457) con el `codigo` estable de 000 §5. */
export const cuerpoProblema = (status: number, codigo: string, detail: string) => ({
  type: tipoProblema(codigo),
  title: tituloProblema(codigo),
  status,
  codigo,
  detail,
});
