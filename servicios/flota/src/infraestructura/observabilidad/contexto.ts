import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { trace } from '@opentelemetry/api';

/**
 * Datos de la petición o del evento en curso que van a los logs y al sobre de los eventos que se publican (000 §4 y §6):
 * el correlationId y el traceparent que llegaron se propagan a todo lo que la petición o el evento disparen.
 */
export interface Contexto {
  correlationId: string;
  traceparent?: string;
}
export const contexto = new AsyncLocalStorage<Contexto>();

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/** Un traceparent W3C válido (versión 00, ids distintos de cero) o undefined. */
export function traceparentValido(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const m = TRACEPARENT.exec(valor.trim().toLowerCase());
  if (!m || /^0+$/.test(m[1]) || /^0+$/.test(m[2])) return undefined;
  return m[0];
}

/**
 * traceparent para un evento nuevo: el span activo si hay trazas (OpenTelemetry), si no el que llegó con la petición o
 * el evento, y si no hay ninguno, uno nuevo.
 */
export function traceparentActual(): string {
  const span = trace.getActiveSpan()?.spanContext();
  if (span && trace.isSpanContextValid(span)) {
    return `00-${span.traceId}-${span.spanId}-${span.traceFlags.toString(16).padStart(2, '0')}`;
  }
  return contexto.getStore()?.traceparent ?? `00-${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-01`;
}
