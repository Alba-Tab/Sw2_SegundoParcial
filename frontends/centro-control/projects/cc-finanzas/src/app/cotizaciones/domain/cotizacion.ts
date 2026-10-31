import type { CotizacionesQuery } from '../../graphql/generado';

export type Cotizacion = NonNullable<CotizacionesQuery['cotizaciones']>[number];
type Cliente = NonNullable<CotizacionesQuery['clientes']>[number];
type Ruta = NonNullable<CotizacionesQuery['rutas']>[number];

/** La razón social de la copia de clientes; si Viajes no respondió, el id. */
export const nombreCliente = (clientes: Cliente[] | null | undefined, id: string): string =>
  clientes?.find((c) => c.clienteId === id)?.razonSocial ?? id;

/** El nombre de la ruta; si Viajes no respondió, el id. */
export const nombreRuta = (rutas: Ruta[] | null | undefined, id: string): string => rutas?.find((r) => r.rutaId === id)?.nombre ?? id;
