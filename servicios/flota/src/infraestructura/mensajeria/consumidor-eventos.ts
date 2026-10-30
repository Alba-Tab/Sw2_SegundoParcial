import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import * as amqp from 'amqplib';
import { LiberarPorCancelacion, type SobreViajeCancelado } from '../../aplicacion/reserva/liberar-por-cancelacion';
import { LiberarPorEntrega, type SobreFinDeViaje } from '../../aplicacion/reserva/liberar-por-entrega';
import { PonerEnViaje, type SobreViajeIniciado } from '../../aplicacion/reserva/poner-en-viaje';
import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import { ProcesarLectura } from '../../aplicacion/combustible/procesar-lectura';
import type { Lectura } from '../../dominio/combustible/caida';
import { entorno } from '../configuracion/entorno';
import { ValidadorEventos } from './validador-eventos';

const COLA = 'flota.eventos';
const SENSOR = 'flota.sensor';

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

  constructor(
    cancelaciones: LiberarPorCancelacion,
    enViaje: PonerEnViaje,
    finDeViaje: LiberarPorEntrega,
    private readonly lecturas: ProcesarLectura,
    private readonly validador: ValidadorEventos,
  ) {
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
        await canal.consume(SENSOR, (m) => void (m && this.procesarLectura(canal, m)));
        this.log.log(`Escuchando ${COLA} y ${SENSOR}`);
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

  /** flota.sensor (spec 009, D30): una lectura sin sobre; la que no cumple LecturaSensorCombustible va a la DLQ. */
  async procesarLectura(canal: amqp.Channel, m: amqp.ConsumeMessage): Promise<void> {
    let lectura: unknown;
    try {
      lectura = JSON.parse(m.content.toString('utf8'));
    } catch {
      lectura = undefined;
    }
    if (!this.validador.mensajeValido('LecturaSensorCombustible', 1, lectura)) {
      this.log.warn(`Lectura inválida en ${SENSOR}: va a la DLQ`);
      canal.nack(m, false, false);
      return;
    }
    try {
      const r = await this.lecturas.ejecutar(lectura as Lectura);
      if (r === 'PLACA_DESCONOCIDA') this.log.warn(`Lectura de una placa desconocida: ${(lectura as Lectura).placa}`);
      canal.ack(m);
    } catch (e) {
      this.log.warn(`Lectura falló, se reencola: ${(e as Error).message}`);
      canal.nack(m, false, true);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.apagando = true;
    await this.conexion?.close().catch(() => undefined);
  }
}
