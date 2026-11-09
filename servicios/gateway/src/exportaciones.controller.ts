import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import type { IntercambioToken } from '@transporte/intercambio-token';
import type { Response } from 'express';
import { GraphQLError } from 'graphql';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { traceparent } from './autenticacion';
import { cuerpoProblema } from './errores';
import { registrar, traceIdDe } from './log';
import { ClienteServicios, ESPERA, rutaRest } from './servicios';
import { HMAC_SECRETO, INTERCAMBIO } from './tokens-inyeccion';

/** Contrato (gateway.yaml): el token no pasa de 400 caracteres. */
export const LARGO_MAXIMO_TOKEN = 400;
/** `base64url(payload)`, un punto y `base64url(HMAC-SHA256)`: 32 bytes son exactamente 43 caracteres sin relleno. */
const FORMA_TOKEN = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/;

const problema = (res: Response, status: number, codigo: string, detail: string) =>
  res
    .status(status)
    .type('application/problem+json')
    .json(cuerpoProblema(status, codigo, detail));

/** Valida el token y devuelve su contenido, o `null` si no es exactamente un token emitido por el Gateway. */
export function leerToken(secreto: string, token: string): { exportacionId: string; sub: string; exp: number } | null {
  if (!secreto || token.length > LARGO_MAXIMO_TOKEN) return null;
  const forma = FORMA_TOKEN.exec(token);
  if (!forma) return null;
  const [, payload, firma] = forma;
  // Se compara el texto base64url completo, no los bytes decodificados: así no pasan variantes de la misma firma
  // (último carácter con otros bits de relleno, `=` al final). Tiempo constante: los dos miden 43.
  const esperada = Buffer.from(createHmac('sha256', secreto).update(payload).digest('base64url'));
  const recibida = Buffer.from(firma);
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  const partes = Buffer.from(payload, 'base64url').toString('utf8').split('.');
  if (partes.length !== 3) return null;
  const [exportacionId, sub, textoExp] = partes;
  const exp = /^\d{1,12}$/.test(textoExp) ? Number(textoExp) : NaN;
  if (!exportacionId || !sub || !Number.isFinite(exp)) return null;
  return { exportacionId, sub, exp };
}

/**
 * `GET /exportaciones/{token}` (D21, spec 015 paso 11): sin Authorization. Cualquier instancia valida el HMAC en tiempo
 * constante y el vencimiento, y pide el archivo a Analítica con el token de servicio del Gateway y `X-Solicitante-Sub`.
 * Los errores salen como `application/problem+json`.
 */
@Controller('exportaciones')
export class ExportacionesController {
  constructor(
    private readonly servicios: ClienteServicios,
    @Inject(INTERCAMBIO) private readonly intercambio: Pick<IntercambioToken, 'tokenDeServicio'>,
    @Inject(HMAC_SECRETO) private readonly secreto: string,
  ) {}

  @Get(':token')
  async descargar(@Param('token') token: string, @Res() res: Response) {
    const datos = leerToken(this.secreto, token);
    if (!datos) return problema(res, 403, 'SIN_PERMISO', 'El enlace no es válido');
    if (datos.exp * 1000 <= Date.now()) return problema(res, 404, 'EXPORTACION_VENCIDA', 'El enlace venció; vuelve a exportar');
    const contexto = {
      usuario: { sub: datos.sub, roles: [], token: '', venceMs: 0 },
      correlationId: randomUUID(),
      traceparent: traceparent(undefined),
    };
    let archivo: globalThis.Response;
    try {
      archivo = await this.servicios.llamar<globalThis.Response>(
        contexto,
        'analitica',
        'GET',
        rutaRest`/api/v1/exportaciones/${datos.exportacionId}/archivo`,
        {
          token: await this.intercambio.tokenDeServicio('analitica'),
          cabeceras: { 'X-Solicitante-Sub': datos.sub },
          tiempoMs: ESPERA.exportar,
          binario: true,
        },
      );
    } catch (e) {
      const status = e instanceof GraphQLError ? Number(e.extensions['status']) : 503;
      if (status === 404) return problema(res, 404, 'EXPORTACION_VENCIDA', 'El enlace venció; vuelve a exportar');
      if (status === 403) return problema(res, 403, 'SIN_PERMISO', 'La exportación es de otra persona');
      if (status === 400) return problema(res, 403, 'SIN_PERMISO', 'El enlace no es válido');
      registrar('WARN', 'No se pudo bajar la exportación de Analítica', {
        correlationId: contexto.correlationId,
        traceId: traceIdDe(contexto.traceparent),
        error: e instanceof Error ? e.message : String(e),
      });
      res.setHeader('Retry-After', '30');
      return problema(res, 503, 'DEPENDENCIA_NO_DISPONIBLE', 'Analítica no disponible');
    }
    res.setHeader('Content-Type', archivo.headers.get('content-type') ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', archivo.headers.get('content-disposition') ?? 'attachment');
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(await archivo.arrayBuffer()));
  }
}
