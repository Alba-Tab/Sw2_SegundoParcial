import { etiqueta } from 'ui-comun/dominio';
import type { MantenimientosQuery } from '../../graphql/generado';

/** Un mantenimiento de la lista general (G9). Programar y cerrar se hacen en la ficha de la unidad (spec 010). */
export type FilaMantenimiento = NonNullable<MantenimientosQuery['mantenimientos']>[number];

/** Lo que encuentra la búsqueda: placa, tipo como se lee en pantalla, taller y descripción. */
export const textoMantenimiento = (m: FilaMantenimiento): string =>
  [m.placa, etiqueta('TipoMantenimiento', m.tipo).texto, m.taller, m.descripcion].join(' ');

/** Solo un mantenimiento en curso se cierra. */
export const puedeCerrar = (m: Pick<FilaMantenimiento, 'estado'>): boolean => m.estado === 'EN_CURSO';
