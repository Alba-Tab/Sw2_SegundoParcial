import type { EstadoViaje, MapaQuery } from '../../graphql/generado';

/** Tipos y reglas de presentación de los viajes (specs 005, 007 y 011). Sin Angular ni Apollo. */
export type ViajeMapa = NonNullable<MapaQuery['viajesEnCurso']>[number];

/** El filtro de la lista de viajes, en el orden de la máquina de estados. */
export const ESTADOS_VIAJE: EstadoViaje[] = [
  'CONFIRMADO',
  'EN_RUTA',
  'ENTREGA_OBSERVADA',
  'ENTREGADO',
  'CERRADO',
  'ENTREGA_RECHAZADA',
  'REQUIERE_INTERVENCION',
  'CANCELADO',
];

/** Estados que piden una decisión del despachador y se pintan como alerta. */
export const estadoConAlerta = (estado?: string): boolean =>
  ['ENTREGA_OBSERVADA', 'REQUIERE_INTERVENCION', 'ENTREGA_RECHAZADA'].includes(estado ?? '');
