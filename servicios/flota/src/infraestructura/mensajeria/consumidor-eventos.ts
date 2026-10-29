import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import * as amqp from 'amqplib';
import { LiberarPorCancelacion, type SobreViajeCancelado } from '../../aplicacion/reserva/liberar-por-cancelacion';
import { entorno } from '../configuracion/entorno';

const COLA = 'flota.eventos';

/**
 * Consumidor de flota.eventos (topología en plataforma/compose/rabbitmq). Un mensaje sin manejador o que no es JSON va
 * a la DLQ (nack sin reencolar); si el manejador falla por algo técnico se reencola y la cola de quórum lo manda a la
 * DLQ al pasar su límite de entregas. Los manejadores de ViajeIniciado y las entregas llegan en F5.
 */
@Injectable()
export class ConsumidorEventos implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(ConsumidorEventos.name);
  private conexion?: amqp.ChannelModel;
  private apagando = false;
  private readonly manejadores: Record<string, (sobre: never) => Promise<boolean>>;

  constructor(cancelaciones: LiberarPorCancelacion) {
    this.manejadores = {
      ViajeCancelado: (s: SobreViajeCancelado) => cancelaciones.ejecutar(s),
    };
  }

  onApplicationBootstrap(): void {
    if (entorno().CONSUMIR_EVENTOS) void this.escuchar();
  }

  private async escuchar(): Promise<void> {
    while (!this.apagando) {
      try {
        this.conexion = await amqp.connect(entorno().AMQP_URL);
        const canal = await this.conexion.createChannel();
        await canal.prefetch(10);
        const cerrada = new Promise((r) => this.conexion!.once('close', r));
        await canal.consume(COLA, (m) => void (m && this.procesar(canal, m)));
        this.log.log(`Escuchando ${COLA}`);
        await cerrada;
      } catch (e) {
        if (!this.apagando) this.log.warn(`${COLA} sin conexión, reintenta en 5 s: ${(e as Error).message}`);
      }
      if (!this.apagando) await new Promise((r) => setTimeout(r, 5000));
    }
  }

  async procesar(canal: amqp.Channel, m: amqp.ConsumeMessage): Promise<void> {
    let sobre: { id?: string; tipo?: string };
    try {
      sobre = JSON.parse(m.content.toString('utf8'));
    } catch {
      sobre = {};
    }
    const manejador = sobre.tipo ? this.manejadores[sobre.tipo] : undefined;
    if (!manejador || !sobre.id) {
      this.log.warn(`Evento sin manejador o inválido: va a la DLQ (${sobre.tipo ?? 'sin tipo'})`);
      canal.nack(m, false, false);
      return;
    }
    try {
      await manejador(sobre as never);
      canal.ack(m);
    } catch (e) {
      this.log.warn(`${sobre.tipo} ${sobre.id} falló, se reencola: ${(e as Error).message}`);
      canal.nack(m, false, true);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.apagando = true;
    await this.conexion?.close().catch(() => undefined);
  }
}
