import { configuracion } from '../configuracion';
import type { Problema } from './generado/viajes';

/** Respuesta que no es 2xx: el Problem Details del servicio (000 §5) y, en un 503, el Retry-After. */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    readonly problema: Problema | null,
    readonly reintentarEnSegundos?: number,
  ) {
    super(problema?.detail ?? `HTTP ${estado}`);
    this.name = 'ErrorApi';
  }

  get codigo(): string | undefined {
    return this.problema?.codigo;
  }
}

let tokenActual: string | undefined;
/** La sesión deja aquí el access token vigente (en memoria, propuesta 7.7). */
export function usarToken(token: string | undefined) {
  tokenActual = token;
}

async function pedir<T>(base: string, url: string, init?: RequestInit): Promise<T> {
  const encabezados = new Headers(init?.headers);
  if (tokenActual) encabezados.set('Authorization', `Bearer ${tokenActual}`);
  const r = await fetch(`${base}${url}`, { ...init, headers: encabezados });
  const cuerpo = r.status === 204 ? null : r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (!r.ok) throw new ErrorApi(r.status, cuerpo, Number(r.headers.get('Retry-After')) || undefined);
  return cuerpo as T;
}

/** Mutators de Orval (orval.config.ts): cada servicio con su URL base. */
export const pedirViajes = <T>(url: string, init?: RequestInit) => pedir<T>(configuracion.viajesUrl, url, init);
export const pedirFinanzas = <T>(url: string, init?: RequestInit) => pedir<T>(configuracion.finanzasUrl, url, init);

/** Encabezado de idempotencia: una clave nueva por intento (000 §4.1). */
export const conClave = (clave: string): RequestInit => ({ headers: { 'Idempotency-Key': clave } });
