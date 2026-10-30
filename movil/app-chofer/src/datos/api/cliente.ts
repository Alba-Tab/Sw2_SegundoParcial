import { configuracion } from '../../configuracion';

/** 15 s por petición (D62); las partes de fotos usan su propio tiempo (T7.5). */
const ESPERA_MS = 15_000;

/**
 * Mutator de Orval: devuelve `{data, status, headers}` con cualquier estado HTTP (el motor decide) y lanza solo si la
 * petición no llegó. El token lo pone quien llama (el motor lo renueva antes de cada tanda).
 */
async function pedir<T>(base: string, url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${base}${url}`, { ...init, signal: init?.signal ?? AbortSignal.timeout(ESPERA_MS) });
  const texto = await r.text();
  let data: unknown = undefined;
  try {
    data = texto ? JSON.parse(texto) : undefined;
  } catch {
    data = texto;
  }
  return { data, status: r.status, headers: r.headers } as T;
}

export const pedirViajes = <T>(url: string, init?: RequestInit) => pedir<T>(configuracion.viajesUrl, url, init);
export const pedirFlota = <T>(url: string, init?: RequestInit) => pedir<T>(configuracion.flotaUrl, url, init);
