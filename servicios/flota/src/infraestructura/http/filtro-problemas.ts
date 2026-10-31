import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import { estadoDe, problema, Problema, tituloDe } from './problemas';

/** Segundos que se sugieren en Retry-After con un 503 (000 §4). */
export const REINTENTAR_EN_S = '30';

/** Código de 000 §5 para cada estado HTTP que puede llegar como HttpException o como error de body-parser. */
const POR_ESTADO: Record<number, string> = {
  400: 'VALIDACION',
  401: 'NO_AUTENTICADO',
  403: 'SIN_PERMISO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO_ESTADO',
  413: 'VALIDACION',
  415: 'VALIDACION',
  429: 'LIMITE_PETICIONES',
  503: 'DEPENDENCIA_NO_DISPONIBLE',
};

/**
 * Errores del driver de Mongo (o de mongoose) que significan "la base no responde": servidor no elegible, red, pool o
 * topología cerrados, y la espera de mongoose mientras no hay conexión. Van como 503 con Retry-After (spec 009).
 */
const MONGO_CAIDO = new Set([
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoNotConnectedError',
  'MongoTopologyClosedError',
  'MongoPoolClearedError',
  'MongoWaitQueueTimeoutError',
]);

export function esMongoCaido(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (MONGO_CAIDO.has(error.name)) return true;
  return error.name === 'MongooseError' && /buffering timed out/i.test(error.message);
}

/** Un error de body-parser o de Express (http-errors): trae `status` 4xx y `expose` dice si su mensaje se puede mostrar. */
function estadoHttp(error: unknown): { estado: number; mensaje?: string } | undefined {
  if (!(error instanceof Error)) return undefined;
  const e = error as Error & { status?: unknown; statusCode?: unknown; expose?: unknown };
  const estado = typeof e.status === 'number' ? e.status : e.statusCode;
  if (typeof estado !== 'number' || estado < 400 || estado > 499) return undefined;
  return { estado, ...(e.expose === true ? { mensaje: e.message } : {}) };
}

/** 000 §5: `campo` va como `errores` solo en un 400 de validación; el resto de `datos` (p. ej. `estadoActual`), como extensiones. */
function conDatos(p: Problema, error: ErrorDeDominio): Problema {
  const { campo, ...extensiones } = error.datos ?? {};
  if (p.status !== 400 || typeof campo !== 'string') return { ...extensiones, ...p };
  const mensaje = error.message.startsWith(`${campo}: `) ? error.message.slice(campo.length + 2) : error.message;
  return { ...extensiones, ...p, errores: [{ campo, mensaje }] };
}

/** Todo error sale como application/problem+json con su código; nunca trazas de pila ni mensajes de la base. */
@Catch()
export class FiltroProblemas implements ExceptionFilter {
  private readonly log = new Logger(FiltroProblemas.name);

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const p = this.aProblema(error);
    if (p.status === 503 && !res.getHeader('Retry-After')) res.setHeader('Retry-After', REINTENTAR_EN_S);
    res.status(p.status).type('application/problem+json').json(p);
  }

  private aProblema(error: unknown): Problema {
    if (error instanceof ErrorDeDominio) {
      return conDatos(problema(error.codigo, tituloDe(estadoDe(error.codigo)), error.message), error);
    }
    if (error instanceof HttpException && error.getStatus() < 500) {
      return this.porEstado(error.getStatus(), error.message);
    }
    if ((error instanceof HttpException && error.getStatus() === 503) || esMongoCaido(error)) {
      this.log.warn(`Dependencia no disponible: ${error instanceof Error ? error.message : String(error)}`);
      return problema('DEPENDENCIA_NO_DISPONIBLE', 'Dependencia no disponible', 'Una dependencia no responde; reintente más tarde', 503);
    }
    const http = estadoHttp(error);
    if (http) return this.porEstado(http.estado, http.mensaje);
    // Error inesperado de verdad: 500, con la traza en el log y nunca en la respuesta. 000 §5 todavía no tiene un código
    // para el 500; se mantiene el que había hasta que se decida.
    this.log.error(`Error no controlado: ${error instanceof Error ? error.stack : String(error)}`);
    return problema('DEPENDENCIA_NO_DISPONIBLE', 'Error interno', 'Ocurrió un error inesperado', 500);
  }

  private porEstado(estado: number, mensaje?: string): Problema {
    const codigo = POR_ESTADO[estado] ?? 'VALIDACION';
    return problema(codigo, tituloDe(estado), mensaje ?? tituloDe(estado), estado);
  }
}
