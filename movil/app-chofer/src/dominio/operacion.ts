/**
 * La cola local (spec 005, CU-08). Cada escritura del chofer es una operación con su `opId` (UUID creado al registrarla,
 * no al enviarla), que viaja como Idempotency-Key: un reenvío nunca duplica nada en el servidor.
 */
export type TipoOperacion = 'INICIO' | 'HITO' | 'EVENTO_CONDUCCION' | 'CARGA_COMBUSTIBLE' | 'ENTREGA' | 'RECHAZO';
export type EstadoOperacion = 'PENDIENTE' | 'CONFIRMADA' | 'FALLIDA' | 'DESCARTADA';

export interface Operacion {
  opId: string;
  viajeId: string;
  tipo: TipoOperacion;
  cuerpo: Record<string, unknown>;
  creadaEn: string;
  intentos: number;
  /** ISO; null = se puede enviar ya. */
  proximoIntentoEn: string | null;
  estado: EstadoOperacion;
  /** `codigo` de 000 §5 cuando quedó FALLIDA. */
  codigoError: string | null;
  /** Cuándo quedó CONFIRMADA, FALLIDA o DESCARTADA (las descartadas se guardan 7 días, D54). */
  cerradaEn: string | null;
}

/** Orden por viaje: el inicio primero; luego hitos, eventos y cargas en orden de creación; la entrega al final. */
const PRIORIDAD: Record<TipoOperacion, number> = {
  INICIO: 0,
  HITO: 1,
  EVENTO_CONDUCCION: 1,
  CARGA_COMBUSTIBLE: 1,
  ENTREGA: 2,
  RECHAZO: 2,
};

export function enOrden(ops: Operacion[]): Operacion[] {
  return [...ops].sort((a, b) => PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo] || a.creadaEn.localeCompare(b.creadaEn));
}

/**
 * La siguiente operación del viaje: la primera pendiente en orden. Si está esperando su reintento, el viaje espera
 * (una petición a la vez por viaje y en orden; ninguna se adelanta).
 */
export function siguiente(ops: Operacion[], ahora: Date): Operacion | null {
  const primera = enOrden(ops.filter((o) => o.estado === 'PENDIENTE'))[0];
  if (!primera) return null;
  if (primera.proximoIntentoEn && Date.parse(primera.proximoIntentoEn) > ahora.getTime()) return null;
  return primera;
}

/** El GPS de un viaje sale solo cuando el servidor ya confirmó su inicio (spec 005). */
export function inicioConfirmado(ops: Operacion[]): boolean {
  return !ops.some((o) => o.tipo === 'INICIO' && o.estado === 'PENDIENTE');
}

export const RETENCION_DESCARTADAS_MS = 7 * 24 * 3600_000;
