import { GraphQLError } from 'graphql';
import type { Contexto } from '../autenticacion';
import type { ClienteServicios } from '../servicios';

export const INTERVALO_MS = 3000;
/** Límite de una petición de Cloud Run: la suscripción se cierra a los 3.600 s y la app reconecta (spec 013). */
export const DURACION_MAXIMA_MS = 3_600_000;

type Alerta = Record<string, unknown>;
type Pagina = { alertas: Alerta[]; siguienteCursor: string | null };

/**
 * `subscription alertas` (spec 013, paso 11): mientras el WebSocket está abierto, consulta a Analítica cada 3 s con el
 * último cursor y emite cada alerta nueva. Empieza al final: lo anterior lo trae `alertasPendientes(desde)`. Si
 * Analítica cae, no corta: reintenta en la siguiente vuelta con el mismo cursor y no se pierde nada.
 *
 * Es un iterador a mano (no un `async function*`) para que `return()` corte la espera en curso: con un generador, una
 * desconexión durante la espera dejaría la consulta corriendo para siempre si no llegan alertas.
 */
export function alertasNuevas(servicios: ClienteServicios, ctx: Contexto, intervaloMs = INTERVALO_MS): AsyncIterableIterator<Alerta> {
  let cursor: string | null = null;
  let alDia = false;
  let cerrado = false;
  let despertar: (() => void) | null = null;
  const pendientes: Alerta[] = [];

  const esperar = () =>
    new Promise<void>((ok) => {
      const t = setTimeout(ok, intervaloMs);
      despertar = () => (clearTimeout(t), ok());
    });

  async function vuelta(): Promise<void> {
    const pagina = await servicios.get<Pagina>(ctx, 'analitica', '/api/v1/alertas', {
      query: { cursor: cursor ?? undefined, limite: 100 },
    });
    cursor = pagina.siguienteCursor ?? cursor;
    // La primera vez se recorre hasta el final sin emitir: eso es historia, no alertas nuevas.
    if (alDia) pendientes.push(...pagina.alertas);
    else if (pagina.alertas.length < 100) alDia = true;
    if (pagina.alertas.length === 100 && !cerrado) return vuelta();
  }

  const fin = (): IteratorReturnResult<undefined> => ({ done: true, value: undefined });

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next(): Promise<IteratorResult<Alerta>> {
      while (!cerrado) {
        if (pendientes.length) return { done: false, value: pendientes.shift()! };
        try {
          await vuelta();
        } catch (e) {
          if (e instanceof GraphQLError && e.extensions['status'] === 401) throw e;
        }
        if (!pendientes.length && !cerrado) await esperar();
      }
      return fin();
    },
    async return(): Promise<IteratorResult<Alerta>> {
      cerrado = true;
      despertar?.();
      return fin();
    },
  };
}
