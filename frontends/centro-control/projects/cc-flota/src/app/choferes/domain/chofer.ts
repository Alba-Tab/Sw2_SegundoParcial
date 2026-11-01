import { etiqueta, vigencia } from 'ui-comun/dominio';
import type { ChoferesQuery, ChoferQuery } from '../../graphql/generado';

/** Choferes (G3): solo lectura; el alta, la edición y la habilitación esperan backend (specs/pendientes.md). */
export type Chofer = NonNullable<ChoferesQuery['choferes']>[number];
export type PuntajesChofer = NonNullable<ChoferQuery['puntajesConduccion']>;

/** El estado que se muestra (grupo EstadoChofer): inhabilitado manda sobre la disponibilidad. */
export const estadoChofer = (c: Pick<Chofer, 'activo' | 'disponible'>): 'DISPONIBLE' | 'OCUPADO' | 'INACTIVO' =>
  !c.activo ? 'INACTIVO' : c.disponible ? 'DISPONIBLE' : 'OCUPADO';

/** Lo que encuentra la búsqueda: nombre, categoría de licencia y estado como se lee en pantalla. */
export const textoChofer = (c: Chofer): string =>
  [c.nombre, c.licenciaCategoria, etiqueta('EstadoChofer', estadoChofer(c)).texto].join(' ');

/** La ficha sale de la lista: no hay `chofer(id)` en el esquema. */
export const buscarChofer = (lista: readonly Chofer[] | null | undefined, id: string): Chofer | undefined =>
  lista?.find((c) => c.choferId === id);

/** Licencia vencida o por vencer: la fila y la ficha la marcan. */
export const vigenciaLicencia = (c: Pick<Chofer, 'licenciaVenceEl'>, hoy?: string) => vigencia(c.licenciaVenceEl, hoy);
