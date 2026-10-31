import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Contexto } from './autenticacion';
import { codigoPorStatus, cuerpoProblema } from './errores';
import { registrar, traceIdDe } from './log';

/** Lo que el parser de Express adjunta a sus errores (`http-errors`). */
type ErrorHttp = { status?: unknown; statusCode?: unknown; type?: unknown; limit?: unknown; message?: unknown };

function detalle(status: number, e: ErrorHttp): string {
  if (status === 413) {
    const kb = typeof e.limit === 'number' ? Math.round(e.limit / 1024) : undefined;
    return kb ? `El cuerpo de la petición pasa el límite de ${kb} KB` : 'El cuerpo de la petición es demasiado grande';
  }
  // Nest convierte el SyntaxError del parser en un 400 con el mensaje de JSON.parse: no se repite.
  if (e.type === 'entity.parse.failed' || (status === 400 && /JSON/.test(String(e.message ?? '')))) {
    return 'El cuerpo de la petición no es un JSON válido';
  }
  if (status === 415) return 'El cuerpo de la petición tiene una codificación que no se acepta';
  if (status === 404) return 'No existe esa ruta';
  return 'La petición no es válida';
}

/**
 * Los errores HTTP que no pasan por GraphQL (un JSON roto o un cuerpo de más de 100 KB en `/graphql`, una ruta que no
 * existe) salen en Problem Details (000 §5) con el `codigo` del status: 400 y 413 → `VALIDACION`, como la consulta mal
 * escrita. Lo inesperado → 500 `ERROR_INTERNO` sin trazas, registrado antes en el log JSON.
 */
@Catch()
export class FiltroProblemas implements ExceptionFilter {
  catch(e: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw e;
    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();
    const x = (e ?? {}) as ErrorHttp;
    if (res.headersSent) return;
    const declarado = e instanceof HttpException ? e.getStatus() : Number(x.status ?? x.statusCode);
    const status = Number.isInteger(declarado) && declarado >= 400 && declarado < 600 ? declarado : 500;
    if (status < 500) {
      return res
        .status(status)
        .type('application/problem+json')
        .json(cuerpoProblema(status, codigoPorStatus(status), detalle(status, x)));
    }
    const ctx = (req as Request & { contexto?: Contexto }).contexto;
    registrar('ERROR', 'Error no controlado en una petición HTTP', {
      correlationId: ctx?.correlationId,
      traceId: traceIdDe(ctx?.traceparent),
      ruta: req.path,
      error: e instanceof Error ? e.message : String(e),
      pila: e instanceof Error ? e.stack : undefined,
    });
    return res
      .status(500)
      .type('application/problem+json')
      .json(cuerpoProblema(500, 'ERROR_INTERNO', 'Error interno del Gateway'));
  }
}
