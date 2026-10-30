import type { LoggerService } from '@nestjs/common';

export type Nivel = 'INFO' | 'WARN' | 'ERROR';

/**
 * Log JSON de una línea (000 §10): `timestamp`, `nivel`, `servicio`, `correlationId`, `traceId` y `mensaje`. Nunca
 * lleva tokens, firmas ni el cuerpo de las peticiones.
 */
export function registrar(nivel: Nivel, mensaje: string, campos: Record<string, unknown> = {}): void {
  const { correlationId = null, traceId = null, ...resto } = campos;
  const linea = { timestamp: new Date().toISOString(), nivel, servicio: 'mcp-server', correlationId, traceId, mensaje, ...resto };
  (nivel === 'INFO' ? process.stdout : process.stderr).write(`${JSON.stringify(linea)}\n`);
}

/** Logger de Nest en JSON (arranque, rutas, errores no capturados); sin debug ni verbose, como antes. */
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
  debug() {}
  verbose() {}
}
