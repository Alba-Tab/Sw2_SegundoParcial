import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { entorno } from '../configuracion/entorno';
import { OUTBOX } from '../persistencia/registro-de-eventos-mongo';
import { ConexionAmqp } from './conexion-amqp';

const EXCHANGE = 'transporte.events';
const LOTE = 100;
const RECLAMO_MS = 30_000;

/**
 * Publica outboxEventos en transporte.events con confirmación del broker y marca publicadoEn (000 §6). Cada fila se
 * reclama 30 s antes de publicarla, así dos instancias no la publican a la vez; si el broker no confirma, la fila
 * vuelve a quedar libre al vencer el reclamo (FC5). Corre en el worker, que está siempre encendido.
 */
@Injectable()
export class RelayOutbox implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(RelayOutbox.name);
  private temporizador?: NodeJS.Timeout;
  private corriendo = false;

  constructor(
    @InjectConnection() private readonly conexion: Connection,
    private readonly amqp: ConexionAmqp,
  ) {}

  onApplicationBootstrap() {
    this.temporizador = setInterval(() => void this.publicarPendientes(), entorno().OUTBOX_INTERVALO_MS);
  }

  onApplicationShutdown() {
    clearInterval(this.temporizador);
  }

  async publicarPendientes(): Promise<number> {
    if (this.corriendo) return 0;
    this.corriendo = true;
    let publicados = 0;
    try {
      const outbox = this.conexion.collection(OUTBOX);
      const canal = await this.amqp.canalConfirmado();
      for (let i = 0; i < LOTE; i++) {
        const ahora = new Date();
        const fila = await outbox.findOneAndUpdate(
          { publicadoEn: null, $or: [{ reclamadoHasta: null }, { reclamadoHasta: { $lt: ahora } }] },
          { $set: { reclamadoHasta: new Date(ahora.getTime() + RECLAMO_MS) } },
          { sort: { creadoEn: 1 }, returnDocument: 'after' },
        );
        if (!fila) break;
        canal.publish(EXCHANGE, fila.claveEnrutamiento, Buffer.from(JSON.stringify(fila.sobre)), {
          contentType: 'application/json',
          contentEncoding: 'utf-8',
          messageId: String(fila._id),
          persistent: true,
        });
        await canal.waitForConfirms();
        await outbox.updateOne({ _id: fila._id }, { $set: { publicadoEn: new Date() } });
        publicados++;
      }
      if (publicados) this.log.log(`Outbox: ${publicados} eventos publicados`);
    } catch (e) {
      this.log.warn(`Outbox: se reintenta en la siguiente vuelta (${String(e)})`);
    } finally {
      this.corriendo = false;
    }
    return publicados;
  }
}
