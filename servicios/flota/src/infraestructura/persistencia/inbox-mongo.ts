import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { Inbox } from '../../aplicacion/puertos/inbox';
import { sesionActual } from './mongo-unidad-de-trabajo';

export const INBOX_EVENTOS = 'inboxEventos';

/**
 * inboxEventos con el eventId como `_id`: el índice único es la autoridad (000 §6). Primero se consulta: una clave
 * duplicada dentro de una transacción la aborta y mongoose la reintenta sin fin. Si dos consumidores insertan a la vez,
 * el segundo aborta, se reintenta y en la relectura ve el evento ya registrado.
 */
@Injectable()
export class InboxMongo implements Inbox {
  constructor(@InjectConnection() private readonly conexion: Connection) {}

  async registrar(eventId: string, tipo: string): Promise<boolean> {
    const session = sesionActual.getStore();
    const col = this.conexion.collection(INBOX_EVENTOS);
    if (await col.findOne({ _id: eventId as never }, { session })) return false;
    await col.insertOne({ _id: eventId as never, tipo, procesadoEn: new Date() }, { session });
    return true;
  }
}
