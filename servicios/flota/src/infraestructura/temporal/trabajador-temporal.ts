import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { NativeConnection, Worker } from '@temporalio/worker';
import type { Connection } from 'mongoose';
import { entorno } from '../configuracion/entorno';
import { crearIndicesFlota } from '../persistencia/colecciones-flota';
import { ActividadesFlota } from './actividades-flota';

/**
 * Worker de la cola `flota` (namespace transporte, D14): solo actividades. Si Temporal no está, reintenta la conexión
 * cada 5 s sin tumbar el proceso (P10); `TEMPORAL_WORKER=false` lo apaga (pruebas).
 */
@Injectable()
export class TrabajadorTemporal implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(TrabajadorTemporal.name);
  private worker?: Worker;
  private apagando = false;

  constructor(
    private readonly actividades: ActividadesFlota,
    @InjectConnection() private readonly conexion: Connection,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await crearIndicesFlota(this.conexion);
    if (!entorno().TEMPORAL_WORKER) return;
    void this.correr();
  }

  private async correr(): Promise<void> {
    while (!this.apagando) {
      try {
        const connection = await NativeConnection.connect({ address: entorno().TEMPORAL_ADDRESS });
        this.worker = await Worker.create({
          connection,
          namespace: 'transporte',
          taskQueue: 'flota',
          activities: this.actividades.mapa(),
        });
        this.log.log(`Worker de Temporal escuchando la cola flota en ${entorno().TEMPORAL_ADDRESS}`);
        await this.worker.run();
        await connection.close();
      } catch (e) {
        this.log.warn(`Temporal no disponible, reintenta en 5 s: ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  onApplicationShutdown(): void {
    this.apagando = true;
    if (this.worker?.getState() === 'RUNNING') this.worker.shutdown();
  }
}
