import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';
import { entorno } from '../configuracion/entorno';

/** Una conexión y un canal con confirmaciones (publisher confirms), creados al primer uso y recreados si se caen. */
@Injectable()
export class ConexionAmqp implements OnModuleDestroy {
  private readonly log = new Logger(ConexionAmqp.name);
  private conexion?: amqp.ChannelModel;
  private canal?: amqp.ConfirmChannel;

  async canalConfirmado(): Promise<amqp.ConfirmChannel> {
    if (this.canal) return this.canal;
    this.conexion = await amqp.connect(entorno().AMQP_URL);
    this.conexion.on('close', () => {
      this.log.warn('Conexión AMQP cerrada');
      this.conexion = undefined;
      this.canal = undefined;
    });
    this.conexion.on('error', (e) => this.log.warn(`Error AMQP: ${String(e)}`));
    this.canal = await this.conexion.createConfirmChannel();
    return this.canal;
  }

  async disponible(): Promise<boolean> {
    try {
      await this.canalConfirmado();
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    await this.conexion?.close().catch(() => undefined);
  }
}
