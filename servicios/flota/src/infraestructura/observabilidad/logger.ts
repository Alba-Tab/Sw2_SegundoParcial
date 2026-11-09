import { trace } from '@opentelemetry/api';
import type { Params } from 'nestjs-pino';
import { type LoggerOptions, pino } from 'pino';
import { contexto } from './contexto';

/** Campos de 000 §10 en una línea JSON: timestamp, nivel, servicio, correlationId, traceId y mensaje. */
function opcionesBase(servicio: string): LoggerOptions {
  return {
    messageKey: 'mensaje',
    base: { servicio },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: { level: (nivel) => ({ nivel: nivel.toUpperCase() }) },
    mixin: () => ({
      correlationId: contexto.getStore()?.correlationId ?? null,
      traceId: trace.getActiveSpan()?.spanContext().traceId ?? null,
    }),
  };
}

/** Logs JSON de una línea con los campos de 000 §10. Nunca se registran tokens ni cuerpos de petición. */
export function opcionesLog(servicio: string): Params {
  return {
    pinoHttp: {
      ...opcionesBase(servicio),
      autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
      serializers: { req: (r) => ({ metodo: r.method, ruta: r.url }), res: (r) => ({ estado: r.statusCode }) },
      redact: ['req.headers.authorization'],
    },
  };
}

/** Un logger pino con el mismo formato, para lo que no pasa por NestJS (el runtime de Temporal). */
export function loggerJson(servicio: string, campos: Record<string, unknown> = {}) {
  return pino(opcionesBase(servicio)).child(campos);
}
