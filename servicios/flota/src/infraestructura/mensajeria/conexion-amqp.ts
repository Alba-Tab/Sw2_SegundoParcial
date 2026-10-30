import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';
import { entorno } from '../configuracion/entorno';

/**
 * Una conexión y un canal con confirmaciones (publisher confirms), creados al primer uso y recreados si se caen. La
 * conexión y el canal tienen listeners de 'error' y 'close': un error de socket o de heartbeat no tumba el proceso y el
 * siguiente uso (la próxima vuelta del relay) vuelve a conectar.
 */
@Injectable()
export class ConexionAmqp implements OnModuleDestroy {
  private readonly log = new Logger(ConexionAmqp.name);
  private conexion?: amqp.ChannelModel;
  private canal?: Promise<amqp.ConfirmChannel>;

  canalConfirmado(): Promise<amqp.ConfirmChannel> {
    // Una sola creación a la vez: dos llamadas simultáneas comparten la misma conexión.
    this.canal ??= this.abrir().catch((e: unknown) => {
      this.canal = undefined;
      throw e;
    });
    return this.canal;
  }

  private async abrir(): Promise<amqp.ConfirmChannel> {
    const conexion = await amqp.connect(entorno().AMQP_URL);
    this.conexion = conexion;
    conexion.on('error', (e) => this.log.warn(`Error en la conexión AMQP: ${String(e)}`));
    conexion.once('close', () => {
      this.log.warn('Conexión AMQP cerrada');
      if (this.conexion === conexion) this.reiniciar();
    });
    try {
      const canal = await conexion.createConfirmChannel();
      canal.on('error', (e) => this.log.warn(`Error en el canal AMQP: ${String(e)}`));
      canal.once('close', () => {
        // El broker cerró solo el canal: se cierra también la conexión y el próximo uso abre las dos.
        if (this.conexion !== conexion) return;
        this.reiniciar();
        void conexion.close().catch(() => undefined);
      });
      return canal;
    } catch (e) {
      await conexion.close().catch(() => undefined);
      throw e;
    }
  }

  private reiniciar(): void {
    this.conexion = undefined;
    this.canal = undefined;
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
    const conexion = this.conexion;
    this.reiniciar();
    await conexion?.close().catch(() => undefined);
  }
}
