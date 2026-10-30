import type { LoggerService } from '@nestjs/common';

export type Nivel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * Log JSON de una línea (000 §10): `timestamp`, `nivel`, `servicio`, `correlationId`, `traceId` y `mensaje`. Nunca
 * lleva tokens, firmas ni el cuerpo de las peticiones.
 */
export function registrar(nivel: Nivel, mensaje: string, campos: Record<string, unknown> = {}): void {
  const { correlationId = null, traceId = null, ...resto } = campos;
  const linea = { timestamp: new Date().toISOString(), nivel, servicio: 'gateway', correlationId, traceId, mensaje, ...resto };
  (nivel === 'ERROR' || nivel === 'WARN' ? process.stderr : process.stdout).write(`${JSON.stringify(linea)}\n`);
}

/** `00-<traceId>-<spanId>-<flags>` → traceId. */
export const traceIdDe = (traceparent: string | undefined) => traceparent?.split('-')[1] ?? null;

/** Logger de Nest en JSON (arranque, rutas, errores no capturados). */
export class LoggerJson implements LoggerService {
  log(mensaje: unknown, contexto?: string) {
    registrar('INFO', String(mensaje), { contexto });
  }
  warn(mensaje: unknown, contexto?: string) {
    registrar('WARN', String(mensaje), { contexto });
  }
  error(mensaje: unknown, pila?: string, contexto?: string) {
    registrar('ERROR', String(mensaje), { contexto, pila });
  }
  /** Como antes (`log`, `warn`, `error`): sin debug ni verbose. */
  debug() {}
  verbose() {}
}
