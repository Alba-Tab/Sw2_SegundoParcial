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

/** Las colas desde las que se abre un viaje para decidir: `?de=` solo acepta estas (V1-5). */
const COLAS_DE_ORIGEN: Readonly<Record<string, { texto: string; ruta: string }>> = {
  'entregas-observadas': { texto: 'Entregas observadas', ruta: '/decisiones/entregas-observadas' },
  intervenciones: { texto: 'Intervenciones', ruta: '/decisiones/intervenciones' },
  acciones: { texto: 'Acciones del agente', ruta: '/acciones' },
};

/** La miga padre del viaje: la cola de origen si `de` es una conocida; si no, la lista de viajes. */
export function colaDeOrigen(de: string | null | undefined): { texto: string; ruta: string } {
  return de && Object.hasOwn(COLAS_DE_ORIGEN, de) ? COLAS_DE_ORIGEN[de] : { texto: 'Viajes', ruta: '/viajes' };
}

/** El mapa terminó de cargar, sin error, y ningún viaje en ruta tiene posición: se dice en vez de dejarlo vacío (FB-5). */
export const mapaSinPosiciones = (viajes: readonly Pick<ViajeMapa, 'ultimaPosicion'>[], cargando: boolean, error: unknown): boolean =>
  !cargando && !error && !viajes.some((v) => v.ultimaPosicion);
