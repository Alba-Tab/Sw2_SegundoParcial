import { etiqueta, vigencia } from 'ui-comun/dominio';
import type { ChoferEdicionInput, ChoferesQuery, ChoferQuery } from '../../graphql/generado';

/** Choferes (G3, D104): sin alta (el usuario se crea en Keycloak); se editan la licencia y la habilitación. */
export type Chofer = NonNullable<ChoferesQuery['choferes']>[number];
export type DetalleChofer = NonNullable<ChoferQuery['chofer']>;
export type PuntajesChofer = NonNullable<ChoferQuery['puntajesConduccion']>;
export type EdicionChofer = Omit<ChoferEdicionInput, 'choferId' | 'claveIdempotencia'>;

export const CATEGORIAS_LICENCIA = ['A', 'B', 'C'] as const;

/** El estado que se muestra (grupo EstadoChofer): inhabilitado manda sobre la disponibilidad. */
export const estadoChofer = (c: Pick<Chofer, 'activo' | 'disponible'>): 'DISPONIBLE' | 'OCUPADO' | 'INACTIVO' =>
  !c.activo ? 'INACTIVO' : c.disponible ? 'DISPONIBLE' : 'OCUPADO';

/** Lo que encuentra la búsqueda: nombre, categoría de licencia y estado como se lee en pantalla. */
export const textoChofer = (c: Chofer): string =>
  [c.nombre, c.licenciaCategoria, etiqueta('EstadoChofer', estadoChofer(c)).texto].join(' ');

/** Licencia vencida o por vencer: la fila y la ficha la marcan. */
export const vigenciaLicencia = (c: Pick<Chofer, 'licenciaVenceEl'>, hoy?: string) => vigencia(c.licenciaVenceEl, hoy);

/** D104: no se inhabilita a un chofer con una reserva activa (`disponible = false`); Flota responde CONFLICTO_ESTADO. */
export const puedeInhabilitar = (c: Pick<Chofer, 'activo' | 'disponible'>): boolean => c.activo && c.disponible;
