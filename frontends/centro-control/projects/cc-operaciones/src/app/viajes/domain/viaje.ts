import type { EstadoViaje, MapaQuery } from '../../graphql/generado';

/** Tipos y reglas de presentación de los viajes (specs 005, 007 y 011). Sin Angular ni Apollo. */
export type ViajeMapa = NonNullable<MapaQuery['viajesEnCurso']>[number];

/** Lo que encuentra la búsqueda de una lista de viajes: placa, cliente, ruta y chofer. */
export const textoViaje = (v: {
  placa?: string | null;
  choferNombre?: string | null;
  cliente?: { razonSocial?: string | null } | null;
  ruta?: { nombre?: string | null } | null;
}): string => [v.placa, v.cliente?.razonSocial, v.ruta?.nombre, v.choferNombre].filter(Boolean).join(' ');

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
