import { fechaLaPaz } from 'ui-comun/dominio';
import type { ReporteParams } from '../../graphql/generado';

/** Analítica limita CUENTAS_POR_COBRAR a 92 días contando los dos extremos: 61 días hacia atrás y 30 hacia adelante. */
export const DIAS_ATRAS = 61;
export const DIAS_ADELANTE = 30;

export const paramsCobranza = (ahora = new Date()): ReporteParams => ({
  desde: fechaLaPaz(-DIAS_ATRAS, ahora),
  hasta: fechaLaPaz(DIAS_ADELANTE, ahora),
  incluirVencidas: true,
});
