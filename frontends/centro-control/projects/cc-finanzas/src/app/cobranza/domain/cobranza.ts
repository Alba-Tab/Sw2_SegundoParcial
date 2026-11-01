import { filtrar, normalizar } from 'ui-comun/dominio';

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
