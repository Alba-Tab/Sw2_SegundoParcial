import { fechaLaPaz, filtrar, normalizar } from 'ui-comun/dominio';
import type { ReporteParams } from '../../graphql/generado';

/** Analítica limita CUENTAS_POR_COBRAR a 92 días contando los dos extremos: 61 días hacia atrás y 30 hacia adelante. */
export const DIAS_ATRAS = 61;
export const DIAS_ADELANTE = 30;

export const paramsCobranza = (ahora = new Date()): ReporteParams => ({
  desde: fechaLaPaz(-DIAS_ATRAS, ahora),
  hasta: fechaLaPaz(DIAS_ADELANTE, ahora),
  incluirVencidas: true,
});

type Fila = Record<string, unknown>;

/**
 * Las filas que coinciden con la búsqueda (en las columnas de texto: cliente, factura). Los totales del reporte no se
 * recalculan: los da Analítica para todas las filas, y la pantalla lo dice mientras se busca.
 */
export function filtrarCuentas<R extends { filas: Fila[]; columnas: { clave: string; tipo: string }[] }>(r: R, q: string): R {
  if (!normalizar(q)) return r;
  const texto = r.columnas.filter((c) => c.tipo === 'TEXTO').map((c) => c.clave);
  return { ...r, filas: filtrar(r.filas, q, (f) => texto.map((c) => String(f[c] ?? '')).join(' ')) };
}
