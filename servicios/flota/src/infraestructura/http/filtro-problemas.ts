import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import { problema, Problema } from './problemas';

const POR_ESTADO: Record<number, [string, string]> = {
  400: ['VALIDACION', 'Petición inválida'],
  401: ['NO_AUTENTICADO', 'No autenticado'],
  403: ['SIN_PERMISO', 'Sin permiso'],
  404: ['NO_ENCONTRADO', 'No encontrado'],
};

/** 000 §5: `campo` va como `errores`; el resto de `datos` (p. ej. `estadoActual`), como extensiones. */
function conDatos(p: Problema, error: ErrorDeDominio): Problema {
  const { campo, ...extensiones } = error.datos ?? {};
  const mensaje = error.message.startsWith(`${String(campo)}: `) ? error.message.slice(String(campo).length + 2) : error.message;
  return { ...extensiones, ...p, ...(typeof campo === 'string' ? { errores: [{ campo, mensaje }] } : {}) };
}

/** Todo error sale como application/problem+json con su código; nunca trazas de pila ni mensajes de la base. */
@Catch()
export class FiltroProblemas implements ExceptionFilter {
  private readonly log = new Logger(FiltroProblemas.name);

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let p: Problema;
    if (error instanceof ErrorDeDominio) {
      p = conDatos(problema(error.codigo, error.codigo, error.message), error);
    } else if (error instanceof HttpException) {
      const estado = error.getStatus();
      const [codigo, titulo] = POR_ESTADO[estado] ?? ['CONFLICTO_ESTADO', 'Error'];
      p = problema(codigo, titulo, error.message, estado);
    } else {
      this.log.error(`Error no controlado: ${error instanceof Error ? error.stack : String(error)}`);
      p = problema('DEPENDENCIA_NO_DISPONIBLE', 'Error interno', 'Ocurrió un error inesperado', 500);
    }
    res.status(p.status).type('application/problem+json').json(p);
  }
}
