/**
 * Qué hacer con cada respuesta (spec 005, motor de sincronización). Red, 5xx, 429, 409 IDEMPOTENCIA_EN_PROCESO y 409
 * CONFIRMACION_EN_CURSO se reintentan con espera exponencial y *full jitter* (base 1 s, ×2, máximo 5 min, sin límite de
 * intentos); si viene Retry-After, manda. Cualquier otro 4xx es definitivo.
 */
export const ESPERA_BASE_MS = 1000;
export const ESPERA_MAXIMA_MS = 5 * 60_000;

export interface Respuesta {
  /** `SIN_RED`: la petición no llegó (o se cortó a los 15 s). */
  estado: number | 'SIN_RED';
  codigo?: string;
  reintentarEnSegundos?: number;
  cuerpo?: unknown;
}

export type Decision =
  | { tipo: 'CONFIRMADA' }
  | { tipo: 'REINTENTAR'; esperaMs: number }
  | { tipo: 'FALLIDA'; codigo: string }
  /** 409 CONFLICTO_ESTADO: quien llama mira si el viaje se canceló mientras no había señal. */
  | { tipo: 'CONFLICTO' }
  /** 401: el token no sirvió; se renueva en la próxima tanda sin tocar la cola. */
  | { tipo: 'SESION' };

const REINTENTABLES_409 = ['IDEMPOTENCIA_EN_PROCESO', 'CONFIRMACION_EN_CURSO'];

/** Full jitter: un valor al azar entre 0 y min(máximo, base × 2^(intentos − 1)). */
export function espera(intentos: number, azar: () => number = Math.random): number {
  const tope = Math.min(ESPERA_MAXIMA_MS, ESPERA_BASE_MS * 2 ** Math.max(0, intentos - 1));
  return Math.floor(azar() * tope);
}

export function decidir(r: Respuesta, intentos: number, azar: () => number = Math.random): Decision {
  const reintentar = (): Decision => ({
    tipo: 'REINTENTAR',
    esperaMs: r.reintentarEnSegundos ? r.reintentarEnSegundos * 1000 : espera(intentos, azar),
  });
  if (r.estado === 'SIN_RED') return reintentar();
  if (r.estado >= 200 && r.estado < 300) return { tipo: 'CONFIRMADA' };
  if (r.estado === 401) return { tipo: 'SESION' };
  if (r.estado >= 500 || r.estado === 429) return reintentar();
  if (r.estado === 409 && r.codigo && REINTENTABLES_409.includes(r.codigo)) return reintentar();
  if (r.estado === 409 && r.codigo === 'CONFLICTO_ESTADO') return { tipo: 'CONFLICTO' };
  return { tipo: 'FALLIDA', codigo: r.codigo ?? `HTTP_${r.estado}` };
}
