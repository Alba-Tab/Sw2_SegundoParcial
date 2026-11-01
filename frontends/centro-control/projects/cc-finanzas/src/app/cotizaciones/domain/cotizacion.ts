import { SIN_DATO } from 'ui-comun/dominio';
import type { CotizacionesQuery } from '../../graphql/generado';

export type Cotizacion = NonNullable<CotizacionesQuery['cotizaciones']>[number];
type Cliente = NonNullable<CotizacionesQuery['clientes']>[number];
type Ruta = NonNullable<CotizacionesQuery['rutas']>[number];

/** La razón social de la copia de clientes; nunca el id crudo: sin lista (Viajes no respondió), "Sin dato". */
export const nombreCliente = (clientes: Cliente[] | null | undefined, id: string): string =>
  clientes ? (clientes.find((c) => c.clienteId === id)?.razonSocial ?? 'Cliente fuera de la lista cargada') : SIN_DATO;

/** El nombre de la ruta; nunca el id crudo. */
export const nombreRuta = (rutas: Ruta[] | null | undefined, id: string): string =>
  rutas ? (rutas.find((r) => r.rutaId === id)?.nombre ?? 'Ruta fuera de la lista cargada') : SIN_DATO;

/** Una cotización vigente cuyo plazo pasó se muestra y se filtra como vencida. */
export const estadoCotizacion = (c: Pick<Cotizacion, 'estado' | 'vencida'>): string => (c.vencida ? 'VENCIDA' : c.estado);
