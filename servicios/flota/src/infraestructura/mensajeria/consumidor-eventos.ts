import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import * as amqp from 'amqplib';
import { LiberarPorCancelacion, type SobreViajeCancelado } from '../../aplicacion/reserva/liberar-por-cancelacion';
import { LiberarPorEntrega, type SobreFinDeViaje } from '../../aplicacion/reserva/liberar-por-entrega';
import { PonerEnViaje, type SobreViajeIniciado } from '../../aplicacion/reserva/poner-en-viaje';
import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import { entorno } from '../configuracion/entorno';

const COLA = 'flota.eventos';

/**
 * Consumidor de flota.eventos (topología en plataforma/compose/rabbitmq). Un mensaje sin manejador o que no es JSON va
 * a la DLQ (nack sin reencolar); si el manejador falla por algo técnico se reencola y la cola de quórum lo manda a la
 * DLQ al pasar su límite de entregas. Un error de negocio (ErrorDeDominio) también va a la DLQ: reintentar no lo arregla.
 */
@Injectable()
export class ConsumidorEventos implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(ConsumidorEventos.name);
  private conexion?: amqp.ChannelModel;
  private apagando = false;
  private readonly manejadores: Record<string, (sobre: never) => Promise<boolean>>;

  constructor(cancelaciones: LiberarPorCancelacion, enViaje: PonerEnViaje, finDeViaje: LiberarPorEntrega) {
    this.manejadores = {
      ViajeCancelado: (s: SobreViajeCancelado) => cancelaciones.ejecutar(s),
      ViajeIniciado: (s: SobreViajeIniciado) => enViaje.ejecutar(s),
      EntregaConfirmada: (s: SobreFinDeViaje) => finDeViaje.ejecutar(s),
      EntregaRechazada: (s: SobreFinDeViaje) => finDeViaje.ejecutar(s),
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
      const negocio = e instanceof ErrorDeDominio || e instanceof TypeError;
      this.log.warn(`${sobre.tipo} ${sobre.id} falló (${negocio ? 'a la DLQ' : 'se reencola'}): ${(e as Error).message}`);
      canal.nack(m, false, !negocio);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.apagando = true;
    await this.conexion?.close().catch(() => undefined);
  }
}
