import { ErrorIntercambio, IntercambioToken } from '@transporte/intercambio-token';
import { GraphQLError } from 'graphql';
import type { Contexto } from './autenticacion';
import type { Configuracion } from './configuracion';
import { errorGraphql, validacion } from './errores';

export type Servicio = 'viajes' | 'flota' | 'finanzas' | 'analitica';

/** Tiempos de espera (D98): componer una pantalla 3 s; mutaciones simples 10 s; exportar 30 s; preguntar 60 s. */
export const ESPERA = { consulta: 3000, mutacion: 10_000, exportar: 30_000, preguntar: 60_000 } as const;

const NOMBRES: Record<Servicio, string> = { viajes: 'Viajes', flota: 'Flota', finanzas: 'Finanzas', analitica: 'Analítica' };

/** Un segmento variable de una ruta REST: un UUID o un valor de enum. Nada de `/`, `.`, `?`, `#` ni `%`. */
const SEGMENTO = /^[A-Za-z0-9_-]{1,64}$/;

/** Ruta REST armada con {@link rutaRest}: el cliente no acepta un texto cualquiera. */
export type RutaRest = string & { readonly __rutaRest: true };

/**
 * Arma la ruta de una llamada REST validando cada valor interpolado (ids que vienen de la app): sin esto,
 * `viaje(id: "../rutas")` o `"x?y=1"` cambiaban la operación que el Gateway llamaba. Un valor inválido → `VALIDACION`
 * sin llamar al servicio.
 */
export function rutaRest(partes: TemplateStringsArray, ...valores: unknown[]): RutaRest {
  let ruta = partes[0];
  valores.forEach((v, i) => {
    const texto = String(v ?? '');
    if (!SEGMENTO.test(texto)) throw validacion('El identificador no es válido', { valor: texto.slice(0, 64) });
    ruta += texto + partes[i + 1];
  });
  return ruta as RutaRest;
}

export interface Llamada {
  query?: Record<string, string | number | boolean | undefined | null>;
  cuerpo?: unknown;
  /** Se reenvía como Idempotency-Key (el servicio dueño es la autoridad, 000 §4.1). */
  clave?: string;
  tiempoMs?: number;
  cabeceras?: Record<string, string>;
  /** Token ya listo (por ejemplo, el de servicio para la descarga de Excel). */
  token?: string;
  binario?: boolean;
}

/**
 * Cliente REST de los 4 servicios. Por cada llamada intercambia el token del usuario por uno con la audiencia del
 * servicio (nunca lo reenvía), propaga `traceparent` y `X-Correlation-Id`, y traduce las fallas:
 * - 4xx → error con el `codigo` del Problem Details del servicio (SIN_PERMISO, CONFLICTO_ESTADO…);
 * - 5xx, tiempo de espera o red → DEPENDENCIA_NO_DISPONIBLE: el campo sale en null y el resto de la respuesta sigue.
 */
export class ClienteServicios {
  private readonly bases: Record<Servicio, string>;

  constructor(
    private readonly intercambio: Pick<IntercambioToken, 'tokenPara' | 'tokenDeServicio'>,
    config: Pick<Configuracion, 'viajesUrl' | 'flotaUrl' | 'finanzasUrl' | 'analiticaUrl'>,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.bases = { viajes: config.viajesUrl, flota: config.flotaUrl, finanzas: config.finanzasUrl, analitica: config.analiticaUrl };
  }

  get<T>(ctx: Contexto, servicio: Servicio, ruta: RutaRest, llamada: Llamada = {}): Promise<T> {
    return this.llamar<T>(ctx, servicio, 'GET', ruta, { tiempoMs: ESPERA.consulta, ...llamada });
  }

  post<T>(ctx: Contexto, servicio: Servicio, ruta: RutaRest, llamada: Llamada = {}): Promise<T> {
    return this.llamar<T>(ctx, servicio, 'POST', ruta, { tiempoMs: ESPERA.mutacion, ...llamada });
  }

  async llamar<T>(ctx: Contexto, servicio: Servicio, metodo: string, ruta: RutaRest, llamada: Llamada): Promise<T> {
    let token: string;
    try {
      token = llamada.token ?? (await this.intercambio.tokenPara(ctx.usuario.token, servicio));
    } catch (e) {
      if (e instanceof ErrorIntercambio) throw errorGraphql(e.codigo, e.message, e.status, { servicio });
      throw e;
    }
    // Se concatena (no `new URL(ruta, base)`) para respetar una base con ruta, por ejemplo detrás de un proxy.
    const url = new URL(`${this.bases[servicio].replace(/\/$/, '')}${ruta}`);
    for (const [k, v] of Object.entries(llamada.query ?? {}))
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    const cabeceras: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'X-Correlation-Id': ctx.correlationId,
      traceparent: ctx.traceparent,
      ...(llamada.clave ? { 'Idempotency-Key': llamada.clave } : {}),
      ...(llamada.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...llamada.cabeceras,
    };
    let respuesta: Response;
    try {
      respuesta = await this.fetchFn(url, {
        method: metodo,
        headers: cabeceras,
        body: llamada.cuerpo !== undefined ? JSON.stringify(llamada.cuerpo) : undefined,
        signal: AbortSignal.timeout(llamada.tiempoMs ?? ESPERA.consulta),
      });
    } catch (e) {
      const lento = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      const segundos = Math.round((llamada.tiempoMs ?? ESPERA.consulta) / 100) / 10;
      throw this.noDisponible(servicio, lento ? `no respondió en ${segundos} s` : 'no responde');
    }
    if (respuesta.status >= 500) throw this.noDisponible(servicio, `respondió ${respuesta.status}`);
    if (!respuesta.ok) {
      const problema = (await respuesta.json().catch(() => ({}))) as { codigo?: string; detail?: string; errores?: unknown };
      throw errorGraphql(
        problema.codigo ?? 'VALIDACION',
        problema.detail ?? `${NOMBRES[servicio]} respondió ${respuesta.status}`,
        respuesta.status,
        {
          servicio,
          ...(problema.errores ? { errores: problema.errores } : {}),
        },
      );
    }
    if (llamada.binario) return respuesta as unknown as T;
    if (respuesta.status === 204) return undefined as T;
    const texto = await respuesta.text();
    return (texto ? JSON.parse(texto) : undefined) as T;
  }

  private noDisponible(servicio: Servicio, detalle: string): GraphQLError {
    return noDisponible(servicio, detalle);
  }
}

/** 5xx, tiempo de espera o red caída: el campo sale en null con DEPENDENCIA_NO_DISPONIBLE y el resto sigue. */
export function noDisponible(servicio: Servicio, detalle: string): GraphQLError {
  return errorGraphql('DEPENDENCIA_NO_DISPONIBLE', `${NOMBRES[servicio]} no disponible (${detalle})`, 503, { servicio });
}
