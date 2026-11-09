import { contexto } from '../observabilidad/contexto';

/** Estado HTTP de cada código de 000 §5 (los que usa Flota). */
const ESTADOS: Record<string, number> = {
  VALIDACION: 400,
  NO_AUTENTICADO: 401,
  SIN_PERMISO: 403,
  NO_ENCONTRADO: 404,
  CONFLICTO_ESTADO: 409,
  VERSION_DESACTUALIZADA: 409,
  IDEMPOTENCIA_EN_PROCESO: 409,
  PLACA_DUPLICADA: 409,
  IDEMPOTENCIA_CUERPO_DISTINTO: 422,
  SIN_UNIDAD_COMPATIBLE: 422,
  CARGA_EXCEDE_TANQUE: 422,
  KILOMETRAJE_INVALIDO: 422,
  DEPENDENCIA_NO_DISPONIBLE: 503,
  ERROR_INTERNO: 500,
};

export interface Problema {
  type: string;
  title: string;
  status: number;
  detail: string;
  codigo: string;
  correlationId?: string;
  errores?: { campo: string; mensaje: string }[];
}

export const estadoDe = (codigo: string): number => ESTADOS[codigo] ?? 422;

/** `title` para personas según el estado HTTP (000 §5), como Problemas.titulo de Viajes; el código va en `codigo`. */
const TITULOS: Record<number, string> = {
  400: 'Petición inválida',
  401: 'No autenticado',
  403: 'Sin permiso',
  404: 'No encontrado',
  409: 'Conflicto con el estado actual',
  413: 'Cuerpo demasiado grande',
  415: 'Tipo de contenido no soportado',
  422: 'Regla de negocio no cumplida',
  429: 'Demasiadas peticiones',
  500: 'Error interno',
  503: 'Dependencia no disponible',
};

export const tituloDe = (estado: number): string => TITULOS[estado] ?? (estado >= 500 ? 'Error interno' : 'Petición inválida');

/** Problem Details (RFC 9457) con `codigo` y `correlationId` (000 §5). */
export function problema(codigo: string, titulo: string, detalle: string, estado = estadoDe(codigo)): Problema {
  const p: Problema = {
    type: `https://transporte.local/errores/${codigo.toLowerCase().replaceAll('_', '-')}`,
    title: titulo,
    status: estado,
    detail: detalle,
    codigo,
  };
  const correlationId = contexto.getStore()?.correlationId;
  if (correlationId) p.correlationId = correlationId;
  return p;
}
