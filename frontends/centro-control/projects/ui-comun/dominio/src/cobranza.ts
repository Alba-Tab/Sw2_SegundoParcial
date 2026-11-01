import { fechaLaPaz } from './formato';

/** Analítica limita CUENTAS_POR_COBRAR a 92 días contando los dos extremos: 61 días hacia atrás y 30 hacia adelante. */
export const DIAS_ATRAS = 61;
export const DIAS_ADELANTE = 30;

/**
 * Con qué abre «Cuentas por cobrar» en Finanzas y en Reportes (NG-2): siempre con lo vencido de los últimos 2 meses, para
 * que la mora no quede escondida y las dos pantallas den el mismo total.
 */
export const paramsCobranza = (ahora = new Date()) => ({
  desde: fechaLaPaz(-DIAS_ATRAS, ahora),
  hasta: fechaLaPaz(DIAS_ADELANTE, ahora),
  incluirVencidas: true,
});
