import { fechaLaPaz } from 'ui-comun/dominio';
import type { ReporteId, ReporteParams } from '../../graphql/generado';

/**
 * Parámetros con que abre cada reporte: cuentas por cobrar mira vencimientos ("esta semana" hacia adelante), viajes en
 * riesgo usa el umbral de 0,70 y los demás, el último mes (rentabilidad agrupada por ruta).
 */
export function paramsPorDefecto(id: ReporteId, ahora = new Date()): ReporteParams {
  const dia = (n: number) => fechaLaPaz(n, ahora);
  if (id === 'CUENTAS_POR_COBRAR') return { desde: dia(0), hasta: dia(6) };
  if (id === 'VIAJES_EN_RIESGO') return { umbral: 0.7 };
  return id === 'RENTABILIDAD' ? { desde: dia(-30), hasta: dia(0), agrupar: 'RUTA' } : { desde: dia(-30), hasta: dia(0) };
}

/** Sin los campos vacíos: Analítica rechaza un parámetro que el reporte no usa. */
export const paramsLimpios = (params: ReporteParams): ReporteParams =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')) as ReporteParams;

/** ¿El esquema JSON de parámetros del reporte tiene ese campo? */
export const usaParametro = (parametros: unknown, campo: string): boolean =>
  campo in ((parametros as { properties?: object } | undefined)?.properties ?? {});
