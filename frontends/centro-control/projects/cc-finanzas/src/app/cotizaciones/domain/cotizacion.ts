import { SIN_DATO } from 'ui-comun/dominio';
import type { CotizacionesQuery } from '../../graphql/generado';

export type Cotizacion = NonNullable<CotizacionesQuery['cotizaciones']>[number];
type Ruta = NonNullable<CotizacionesQuery['rutas']>[number];

/** La razón social que trae la cotización (E5-1); nunca el id crudo: si Viajes no la dio, "Sin dato". */
export const nombreCliente = (c: { razonSocial?: string | null }): string => c.razonSocial ?? SIN_DATO;

/** El nombre de la ruta; nunca el id crudo. */
export const nombreRuta = (rutas: Ruta[] | null | undefined, id: string): string =>
  rutas ? (rutas.find((r) => r.rutaId === id)?.nombre ?? 'Ruta fuera de la lista cargada') : SIN_DATO;

/** Una cotización vigente cuyo plazo pasó se muestra y se filtra como vencida. */
export const estadoCotizacion = (c: Pick<Cotizacion, 'estado' | 'vencida'>): string => (c.vencida ? 'VENCIDA' : c.estado);
