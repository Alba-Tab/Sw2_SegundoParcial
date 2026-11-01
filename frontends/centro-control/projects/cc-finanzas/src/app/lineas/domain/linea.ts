import { aCentavos, desdeCentavos, estadoLineaCredito, sumarMontos } from 'ui-comun/dominio';
import type { LineasCreditoQuery } from '../../graphql/generado';

/** G6: un cliente con su línea de crédito; administración y gerente ajustan el límite o la suspenden (spec 012). */
export type ClienteConLinea = NonNullable<LineasCreditoQuery['clientes']>[number];
export type Linea = NonNullable<ClienteConLinea['lineaCredito']>;

/** Solo los clientes con línea: sin ella (o si Finanzas no la dio) no hay nada que mostrar en esta lista. */
export const conLinea = (clientes: readonly ClienteConLinea[]): (ClienteConLinea & { lineaCredito: Linea })[] =>
  clientes.filter((c): c is ClienteConLinea & { lineaCredito: Linea } => !!c.lineaCredito);

/** Lo que encuentra la búsqueda: razón social y NIT. */
export const textoLinea = (c: ClienteConLinea): string => [c.razonSocial, c.nit ?? ''].join(' ');

export const estadoLinea = (c: { lineaCredito: Linea }) => estadoLineaCredito(c.lineaCredito);

/** Lo que la línea ya comprometió (reservado + utilizado): el límite nuevo no baja de aquí (spec 012). */
export const usadoDe = (l: Pick<Linea, 'reservado' | 'utilizado'>): string => sumarMontos([l.reservado, l.utilizado]);

/** El disponible que deja un límite nuevo, para el resumen de la confirmación. */
export const disponibleCon = (limite: string, usado: string): string => desdeCentavos((aCentavos(limite) ?? 0n) - (aCentavos(usado) ?? 0n));

/** Lo que se pide confirmar: ajustar el límite, o suspender o reactivar según el estado actual. */
export type AccionLinea = 'ajustar' | 'suspender' | 'reactivar';
