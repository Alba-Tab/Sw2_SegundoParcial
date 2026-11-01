import type { ClienteQuery, ClientesQuery } from '../../graphql/generado';

/** Clientes (G7): lista y ficha de solo lectura; la edición desde el Centro de Control espera backend. */
export type FilaCliente = NonNullable<ClientesQuery['clientes']>[number];
export type DatosCliente = NonNullable<ClienteQuery['clientes']>[number];
export type ServicioCliente = NonNullable<ClienteQuery['servicios']>[number];

/** Lo que encuentra la búsqueda: razón social, NIT y correo. */
export const textoCliente = (c: Pick<FilaCliente, 'razonSocial' | 'nit' | 'correo'>): string =>
  [c.razonSocial, c.nit ?? '', c.correo ?? ''].join(' ');

/** La ficha sale de la lista: no hay `cliente(id)` en el esquema. */
export const buscarCliente = <T extends { clienteId: string }>(lista: readonly T[] | null | undefined, id: string): T | undefined =>
  lista?.find((c) => c.clienteId === id);

/** El nombre de la ruta de la copia de rutas; si no está, nada (la fila muestra solo la carga). */
export const nombreRuta = (
  rutas: readonly { rutaId: string; nombre: string }[] | null | undefined,
  id: string | null | undefined,
): string => (id && rutas?.find((r) => r.rutaId === id)?.nombre) || '';
