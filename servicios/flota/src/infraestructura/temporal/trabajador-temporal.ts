import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { DefaultLogger, NativeConnection, Runtime, Worker } from '@temporalio/worker';
import type { Connection } from 'mongoose';
import { entorno } from '../configuracion/entorno';
import { loggerJson } from '../observabilidad/logger';
import { crearIndicesFlota } from '../persistencia/colecciones-flota';
import { ActividadesFlota } from './actividades-flota';

const NIVELES = { TRACE: 'trace', DEBUG: 'debug', INFO: 'info', WARN: 'warn', ERROR: 'error' } as const;
let runtimeInstalado = false;

/**
 * Los logs del SDK de Temporal (y los del core nativo, reenviados desde WARN) salen en el mismo JSON de 000 §10 que el
 * resto del worker, no en texto por stderr. Se instala una sola vez, antes de crear la primera conexión.
 */
function instalarRuntime(): void {
  if (runtimeInstalado) return;
  runtimeInstalado = true;
  const log = loggerJson('flota', { origen: 'temporal' });
  Runtime.install({
    logger: new DefaultLogger('INFO', ({ level, message, meta }) => log[NIVELES[level]]({ ...meta }, message)),
    telemetryOptions: { logging: { filter: { core: 'WARN', other: 'ERROR' }, forward: {} } },
  });
}

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
    instalarRuntime();
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
