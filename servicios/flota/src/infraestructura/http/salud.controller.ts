import { Controller, Get, Res } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Response } from 'express';
import type { Connection } from 'mongoose';
import type { z } from 'zod';
import type { SaludListaResponse, SaludResponse } from './contrato/flota.zod';
import { ConexionAmqp } from '../mensajeria/conexion-amqp';

/**
 * GET /health (vivo) y GET /health/ready (Mongo y RabbitMQ), sin autenticación ni Keycloak (000 §4, P10).
 * Los tipos de respuesta salen de contratos/openapi/flota.yaml (contrato/flota.zod.ts, generado por Orval).
 */
@Controller('health')
export class SaludController {
  constructor(
    @InjectConnection() private readonly mongo: Connection,
    private readonly amqp: ConexionAmqp,
  ) {}

  @Get()
  vivo(): z.infer<typeof SaludResponse> {
    return { estado: 'UP' };
  }

  @Get('ready')
  async listo(@Res({ passthrough: true }) res: Response): Promise<z.infer<typeof SaludListaResponse>> {
    const mongo = await this.pingMongo();
    const rabbitmq: 'UP' | 'DOWN' = (await this.amqp.disponible()) ? 'UP' : 'DOWN';
    const arriba = mongo === 'UP' && rabbitmq === 'UP';
    res.status(arriba ? 200 : 503);
    if (!arriba) res.setHeader('Retry-After', '30');
    return { estado: arriba ? ('UP' as const) : ('DOWN' as const), dependencias: { mongo, rabbitmq } };
  }

  private async pingMongo(): Promise<'UP' | 'DOWN'> {
    try {
      await this.mongo.db?.admin().ping();
      return this.mongo.db ? 'UP' : 'DOWN';
    } catch {
      return 'DOWN';
    }
  }
}
