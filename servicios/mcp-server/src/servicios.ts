import { ErrorIntercambio, type IntercambioToken } from '@transporte/intercambio-token';
import type { Llamador } from './autenticacion';
import type { Configuracion } from './configuracion';

export type Servicio = 'viajes' | 'flota' | 'finanzas' | 'analitica';
/** D90: el servidor espera como máximo 15 s al servicio detrás de cada herramienta. */
export const ESPERA_MS = 15_000;

/** Error de una herramienta con el código de 000 §5: va al LLM como `isError` para que corrija o siga. */
export class ErrorHerramienta extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export interface Contexto {
  llamador: Llamador;
  correlationId: string;
  traceparent?: string;
  misionId?: string;
}

/** Cada herramienta llama a UNA operación REST fija, con el token intercambiado (nunca el recibido, propuesta 8). */
export class ClienteServicios {
  private readonly bases: Record<Servicio, string>;

  constructor(
    private readonly intercambio: Pick<IntercambioToken, 'tokenPara'>,
    config: Pick<Configuracion, 'viajesUrl' | 'flotaUrl' | 'finanzasUrl' | 'analiticaUrl'>,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.bases = { viajes: config.viajesUrl, flota: config.flotaUrl, finanzas: config.finanzasUrl, analitica: config.analiticaUrl };
  }

  async llamar<T>(
    ctx: Contexto,
    servicio: Servicio,
    metodo: 'GET' | 'POST',
    ruta: string,
    opciones: { query?: Record<string, unknown>; cuerpo?: unknown; cabeceras?: Record<string, string> } = {},
  ): Promise<T> {
    let token: string;
    try {
      token = await this.intercambio.tokenPara(ctx.llamador.token, servicio);
    } catch (e) {
      throw new ErrorHerramienta(
        e instanceof ErrorIntercambio ? e.codigo : 'DEPENDENCIA_NO_DISPONIBLE',
        'No se pudo obtener el token del servicio',
      );
    }
    const url = new URL(`${this.bases[servicio].replace(/\/$/, '')}${ruta}`);
    for (const [k, v] of Object.entries(opciones.query ?? {}))
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    let r: Response;
    try {
      r = await this.fetchFn(url, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Correlation-Id': ctx.correlationId,
          ...(ctx.traceparent ? { traceparent: ctx.traceparent } : {}),
          ...(opciones.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...opciones.cabeceras,
        },
        body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
        signal: AbortSignal.timeout(ESPERA_MS),
      });
    } catch {
      throw new ErrorHerramienta('DEPENDENCIA_NO_DISPONIBLE', `${servicio} no respondió en ${ESPERA_MS / 1000} s`);
    }
    if (r.status >= 500) throw new ErrorHerramienta('DEPENDENCIA_NO_DISPONIBLE', `${servicio} respondió ${r.status}`);
    const cuerpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok)
      throw new ErrorHerramienta(String(cuerpo['codigo'] ?? 'VALIDACION'), String(cuerpo['detail'] ?? `${servicio} respondió ${r.status}`));
    return cuerpo as T;
  }
}
