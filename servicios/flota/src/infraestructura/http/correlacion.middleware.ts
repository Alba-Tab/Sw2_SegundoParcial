import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { uuid7 } from '../../dominio/comun/uuid7';
import { contexto, traceparentValido } from '../observabilidad/contexto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * X-Correlation-Id (000 §4): lo genera si no viene o no es UUID, lo deja en el contexto y lo devuelve. El traceparent
 * que llega también queda en el contexto: los eventos que la petición deje en el Outbox lo llevan.
 */
@Injectable()
export class CorrelacionMiddleware implements NestMiddleware {
  use(req: Request, res: Response, siguiente: NextFunction) {
    const recibido = req.header('x-correlation-id');
    const correlationId = recibido && UUID.test(recibido) ? recibido.toLowerCase() : uuid7();
    res.setHeader('X-Correlation-Id', correlationId);
    const traceparent = traceparentValido(req.header('traceparent'));
    contexto.run({ correlationId, ...(traceparent ? { traceparent } : {}) }, siguiente);
  }
}
