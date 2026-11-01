import { estadoLineaCredito } from 'ui-comun/dominio';
import type { LineasCreditoQuery } from '../../graphql/generado';

/** G6: un cliente con su línea de crédito (solo lectura; el ajuste espera backend). */
export type ClienteConLinea = NonNullable<LineasCreditoQuery['clientes']>['items'][number];
export type Linea = NonNullable<ClienteConLinea['lineaCredito']>;

/** Solo los clientes con línea: sin ella (o si Finanzas no la dio) no hay nada que mostrar en esta lista. */
export const conLinea = (clientes: readonly ClienteConLinea[]): (ClienteConLinea & { lineaCredito: Linea })[] =>
  clientes.filter((c): c is ClienteConLinea & { lineaCredito: Linea } => !!c.lineaCredito);

/** Lo que encuentra la búsqueda: razón social y NIT. */
export const textoLinea = (c: ClienteConLinea): string => [c.razonSocial, c.nit ?? ''].join(' ');

export const estadoLinea = (c: { lineaCredito: Linea }) => estadoLineaCredito(c.lineaCredito);
