import { Controller, Get, HttpException, Inject, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { ClienteServicios, ESPERA } from './servicios';
import { HMAC_SECRETO, INTERCAMBIO } from './tokens-inyeccion';
import type { IntercambioToken } from '@transporte/intercambio-token';
import { GraphQLError } from 'graphql';

const problema = (status: number, codigo: string, detail: string) =>
  new HttpException(
    { type: `https://transporte.local/errores/${codigo.toLowerCase().replace(/_/g, '-')}`, title: codigo, status, codigo, detail },
    status,
  );

/**
 * `GET /exportaciones/{token}` (D21, spec 015 paso 11): sin Authorization. Cualquier instancia valida el HMAC en tiempo
 * constante y el vencimiento, y pide el archivo a Analítica con el token de servicio del Gateway y `X-Solicitante-Sub`.
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
    const [payload, firma] = token.split('.');
    const esperada = this.secreto && payload ? createHmac('sha256', this.secreto).update(payload).digest() : Buffer.alloc(0);
    const recibida = Buffer.from(firma ?? '', 'base64url');
    if (!payload || esperada.length === 0 || recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
      throw problema(403, 'SIN_PERMISO', 'El enlace no es válido');
    }
    const [exportacionId, sub, exp] = Buffer.from(payload, 'base64url').toString('utf8').split('.');
    if (!exp || Number(exp) * 1000 <= Date.now()) throw problema(404, 'EXPORTACION_VENCIDA', 'El enlace venció; vuelve a exportar');
    const contexto = {
      usuario: { sub, roles: [], token: '', venceMs: 0 },
      correlationId: randomUUID(),
      traceparent: `00-${randomUUID().replace(/-/g, '')}-${randomUUID().replace(/-/g, '').slice(0, 16)}-01`,
    };
    try {
      const archivo = await this.servicios.llamar<globalThis.Response>(
        contexto,
        'analitica',
        'GET',
        `/api/v1/exportaciones/${exportacionId}/archivo`,
        {
          token: await this.intercambio.tokenDeServicio('analitica'),
          cabeceras: { 'X-Solicitante-Sub': sub },
          tiempoMs: ESPERA.exportar,
          binario: true,
        },
      );
      res.setHeader('Content-Type', archivo.headers.get('content-type') ?? 'application/octet-stream');
      res.setHeader('Content-Disposition', archivo.headers.get('content-disposition') ?? 'attachment');
      res.setHeader('Cache-Control', 'no-store');
      res.send(Buffer.from(await archivo.arrayBuffer()));
    } catch (e) {
      const status = e instanceof GraphQLError ? Number(e.extensions['status']) : 503;
      if (status === 404) throw problema(404, 'EXPORTACION_VENCIDA', 'El enlace venció; vuelve a exportar');
      if (status === 403) throw problema(403, 'SIN_PERMISO', 'La exportación es de otra persona');
      res.setHeader('Retry-After', '30');
      throw problema(503, 'DEPENDENCIA_NO_DISPONIBLE', 'Analítica no disponible');
    }
  }
}
