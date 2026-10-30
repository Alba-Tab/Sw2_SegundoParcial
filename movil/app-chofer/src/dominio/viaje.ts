/** El viaje como lo guarda el celular: lo que llegó de `GET /viajes/mios` más lo que el chofer hizo sin señal. */
export type EstadoViaje =
  | 'PROGRAMANDO'
  | 'CONFIRMADO'
  | 'EN_RUTA'
  | 'ENTREGADO'
  | 'CERRADO'
  | 'CANCELADO'
  | 'ENTREGA_OBSERVADA'
  | 'ENTREGA_RECHAZADA'
  | 'REQUIERE_INTERVENCION';

export interface ViajeLocal {
  viajeId: string;
  estado: EstadoViaje;
  /** El chofer pulsó "Iniciar viaje" y el inicio espera en la cola. */
  iniciadoLocal: boolean;
  /** Se canceló mientras el inicio esperaba sin señal (plan F7). */
  canceladoAlSincronizar: boolean;
  cliente: string;
  ruta: string;
  destino: { lat: number; lng: number; radioMetros: number };
  tipoCarga: string;
  toneladas: number;
  fechaViaje: string;
  placa: string;
}

/** Lo que ve el chofer: en ruta desde que pulsa iniciar, aunque el servidor todavía no lo sepa. */
export function estadoVisible(v: ViajeLocal): EstadoViaje {
  if (v.canceladoAlSincronizar) return 'CANCELADO';
  if (v.iniciadoLocal && v.estado === 'CONFIRMADO') return 'EN_RUTA';
  return v.estado;
}

export function puedeIniciar(v: ViajeLocal, otros: ViajeLocal[]): boolean {
  return estadoVisible(v) === 'CONFIRMADO' && !otros.some((o) => o.viajeId !== v.viajeId && estadoVisible(o) === 'EN_RUTA');
}
