import { Controller, Get, Res } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Response } from 'express';
import type { Connection } from 'mongoose';
import { ConexionAmqp } from '../mensajeria/conexion-amqp';

/** GET /health (vivo) y GET /health/ready (Mongo y RabbitMQ), sin autenticación ni Keycloak (000 §4, P10). */
@Controller('health')
export class SaludController {
  constructor(
    @InjectConnection() private readonly mongo: Connection,
    private readonly amqp: ConexionAmqp,
  ) {}

  @Get()
  vivo() {
    return { estado: 'UP' };
  }

  @Get('ready')
  async listo(@Res({ passthrough: true }) res: Response) {
    const mongo = await this.mongo.db?.admin().ping().then(() => 'UP').catch(() => 'DOWN') ?? 'DOWN';
    const rabbitmq = (await this.amqp.disponible()) ? 'UP' : 'DOWN';
    const arriba = mongo === 'UP' && rabbitmq === 'UP';
    res.status(arriba ? 200 : 503);
    return { estado: arriba ? 'UP' : 'DOWN', dependencias: { mongo, rabbitmq } };
  }
}
