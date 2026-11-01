import type { Operacion } from './operacion';

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
  /** El chofer registró la entrega o el rechazo y espera en la cola. */
  entregaLocal: 'ENTREGA' | 'RECHAZO' | null;
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
  const sinSalir = v.estado === 'CONFIRMADO' || v.estado === 'EN_RUTA';
  if (v.entregaLocal && sinSalir) return v.entregaLocal === 'ENTREGA' ? 'ENTREGADO' : 'ENTREGA_RECHAZADA';
  if (v.iniciadoLocal && v.estado === 'CONFIRMADO') return 'EN_RUTA';
  return v.estado;
}

/**
 * D106: el inicio volvió con 409 CONFLICTO_ESTADO y el servidor sigue con el viaje CONFIRMADO (por ejemplo, el chofer ya
 * tiene otro viaje en ruta). La marca local se libera; si el servidor ya lo sacó de CONFIRMADO, manda su estado.
 */
export function inicioRechazado(v: ViajeLocal, ops: Operacion[]): boolean {
  if (!v.iniciadoLocal || v.estado !== 'CONFIRMADO') return false;
  const ultimo = ops.filter((o) => o.viajeId === v.viajeId && o.tipo === 'INICIO').at(-1);
  return ultimo?.estado === 'FALLIDA' && ultimo.codigoError === 'CONFLICTO_ESTADO';
}

export function puedeIniciar(v: ViajeLocal, otros: ViajeLocal[]): boolean {
  return estadoVisible(v) === 'CONFIRMADO' && !otros.some((o) => o.viajeId !== v.viajeId && estadoVisible(o) === 'EN_RUTA');
}

/**
 * Al bajar `GET /viajes/mios` (D50): los viajes del celular que el servidor ya no devuelve se borran (terminaron hace
 * más de 7 días, se reasignaron o eran de otro chofer), salvo los que todavía tienen operaciones por enviar.
 */
export function viajesQueSobran(locales: string[], delServidor: string[], conPendientes: string[]): string[] {
  const quedan = new Set([...delServidor, ...conPendientes]);
  return locales.filter((id) => !quedan.has(id));
}
