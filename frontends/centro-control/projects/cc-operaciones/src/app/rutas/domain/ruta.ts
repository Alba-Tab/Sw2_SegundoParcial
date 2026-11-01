import type { RutasQuery } from '../../graphql/generado';

/** Rutas (G4): solo lectura; el alta y la edición esperan backend. `radioMetros` aún no está en el esquema. */
export type Ruta = NonNullable<RutasQuery['rutas']>[number];

/** Lo que encuentra la búsqueda: nombre, origen y destino. */
export const textoRuta = (r: Ruta): string => [r.nombre, r.origen, r.destino].join(' ');

/** La ficha sale de la lista: no hay `ruta(id)` en el esquema. */
export const buscarRuta = (lista: readonly Ruta[] | null | undefined, id: string): Ruta | undefined => lista?.find((r) => r.rutaId === id);
