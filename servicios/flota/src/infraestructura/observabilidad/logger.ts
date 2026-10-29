import { trace } from '@opentelemetry/api';
import type { Params } from 'nestjs-pino';
import { contexto } from './contexto';

/** Logs JSON de una línea con los campos de 000 §10. Nunca se registran tokens ni cuerpos de petición. */
export function opcionesLog(servicio: string): Params {
  return {
    pinoHttp: {
      messageKey: 'mensaje',
      base: { servicio },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      formatters: { level: (nivel) => ({ nivel: nivel.toUpperCase() }) },
      mixin: () => ({
        correlationId: contexto.getStore()?.correlationId ?? null,
        traceId: trace.getActiveSpan()?.spanContext().traceId ?? null,
      }),
      autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
      serializers: { req: (r) => ({ metodo: r.method, ruta: r.url }), res: (r) => ({ estado: r.statusCode }) },
      redact: ['req.headers.authorization'],
    },
  };
}
