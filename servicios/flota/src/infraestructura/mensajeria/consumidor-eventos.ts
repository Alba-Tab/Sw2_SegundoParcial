import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import * as amqp from 'amqplib';
import { LiberarPorCancelacion, type SobreViajeCancelado } from '../../aplicacion/reserva/liberar-por-cancelacion';
import { LiberarPorEntrega, type SobreFinDeViaje } from '../../aplicacion/reserva/liberar-por-entrega';
import { PonerEnViaje, type SobreViajeIniciado } from '../../aplicacion/reserva/poner-en-viaje';
import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import { uuid7 } from '../../dominio/comun/uuid7';
import { ProcesarLectura } from '../../aplicacion/combustible/procesar-lectura';
import type { Lectura } from '../../dominio/combustible/caida';
import { entorno } from '../configuracion/entorno';
import { contexto, traceparentValido } from '../observabilidad/contexto';
import { ValidadorEventos } from './validador-eventos';

const COLA = 'flota.eventos';
const SENSOR = 'flota.sensor';
const PREFETCH_EVENTOS = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Espera antes de reencolar un mensaje que falló por algo técnico: 1, 2, 4, 8 s… (tope 15 s) según las entregas que ya
 * tuvo (`x-delivery-count` de la cola quorum). Así una caída corta de Mongo no agota las 5 entregas antes de la DLQ.
 */
export function esperaParaReencolar(entregas: number): number {
  return Math.min(1000 * 2 ** Math.max(entregas, 0), 15_000);
}

/**
 * Consumidor de flota.eventos y flota.sensor (topología en plataforma/compose/rabbitmq). Un mensaje sin manejador o que
 * no es JSON va a la DLQ (nack sin reencolar); si el manejador falla por algo técnico se reencola después de una espera
 * y la cola quorum lo manda a la DLQ al pasar su límite de entregas. Un error de negocio (ErrorDeDominio) también va a la
 * DLQ: reintentar no lo arregla. flota.sensor va en su propio canal con prefetch 1: las lecturas se procesan en serie
 * porque la detección de una caída depende de las anteriores (spec 009).
 * Si se cae la conexión o un canal (error de socket, heartbeat, canal cerrado por el broker), cierra todo y reconecta
 * cada 5 s; los listeners de 'error' evitan que el proceso caiga con "Unhandled 'error' event".
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
        const conexion = await amqp.connect(entorno().AMQP_URL);
        this.conexion = conexion;
        let avisarCaida!: () => void;
        const caida = new Promise<void>((r) => (avisarCaida = r));
        conexion.on('error', (e) => this.log.warn(`Error en la conexión AMQP: ${String(e)}`));
        conexion.once('close', () => avisarCaida());
        const eventos = await this.abrirCanal(conexion, PREFETCH_EVENTOS, avisarCaida);
        const sensor = await this.abrirCanal(conexion, 1, avisarCaida);
        // Un consumidor cancelado por el broker (cola borrada) recibe null: se reconecta.
        await eventos.consume(COLA, (m) => (m ? void this.procesar(eventos, m) : avisarCaida()));
        await sensor.consume(SENSOR, (m) => (m ? void this.procesarLectura(sensor, m) : avisarCaida()));
        this.log.log(`Escuchando ${COLA} y ${SENSOR}`);
        await caida;
        if (!this.apagando) this.log.warn(`${COLA} y ${SENSOR}: se cayó la conexión o un canal, reconecta en 5 s`);
      } catch (e) {
        if (!this.apagando) this.log.warn(`${COLA} sin conexión, reintenta en 5 s: ${(e as Error).message}`);
      }
      // Si solo se cerró un canal, la conexión sigue abierta: se cierra para empezar de nuevo con todo.
      await this.conexion?.close().catch(() => undefined);
      this.conexion = undefined;
      if (!this.apagando) await new Promise((r) => setTimeout(r, 5000));
    }
  }

  private async abrirCanal(conexion: amqp.ChannelModel, prefetch: number, alCerrar: () => void): Promise<amqp.Channel> {
    const canal = await conexion.createChannel();
    canal.on('error', (e) => this.log.warn(`Error en un canal AMQP: ${String(e)}`));
    canal.once('close', alCerrar);
    await canal.prefetch(prefetch);
    return canal;
  }

  async procesar(canal: amqp.Channel, m: amqp.ConsumeMessage): Promise<void> {
    let sobre: { id?: string; tipo?: string; correlationId?: unknown; traceparent?: unknown };
    try {
      sobre = JSON.parse(m.content.toString('utf8'));
    } catch {
      sobre = {};
    }
    const manejador = sobre.tipo ? this.manejadores[sobre.tipo] : undefined;
    if (!manejador || !sobre.id) {
      this.log.warn(`Evento sin manejador o inválido: va a la DLQ (${sobre.tipo ?? 'sin tipo'})`);
      this.responder(() => canal.nack(m, false, false));
      return;
    }
    // Los eventos que el manejador deje en el Outbox llevan el correlationId y el traceparent del evento consumido.
    const correlationId = typeof sobre.correlationId === 'string' && UUID.test(sobre.correlationId) ? sobre.correlationId : uuid7();
    const traceparent = traceparentValido(sobre.traceparent);
    try {
      await contexto.run({ correlationId, ...(traceparent ? { traceparent } : {}) }, () => manejador(sobre as never));
      this.responder(() => canal.ack(m));
    } catch (e) {
      const negocio = e instanceof ErrorDeDominio || e instanceof TypeError;
      this.log.warn(`${sobre.tipo} ${sobre.id} falló (${negocio ? 'a la DLQ' : 'se reencola'}): ${(e as Error).message}`);
      if (negocio) this.responder(() => canal.nack(m, false, false));
      else this.reencolar(canal, m);
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
      this.responder(() => canal.nack(m, false, false));
      return;
    }
    try {
      const r = await contexto.run({ correlationId: uuid7() }, () => this.lecturas.ejecutar(lectura as Lectura));
      if (r === 'PLACA_DESCONOCIDA') this.log.warn(`Lectura de una placa desconocida: ${(lectura as Lectura).placa}`);
      this.responder(() => canal.ack(m));
    } catch (e) {
      this.log.warn(`Lectura falló, se reencola: ${(e as Error).message}`);
      this.reencolar(canal, m);
    }
  }

  /** nack con reencolado después de una espera; mientras tanto el mensaje sigue ocupando su lugar del prefetch. */
  private reencolar(canal: amqp.Channel, m: amqp.ConsumeMessage): void {
    const entregas = Number(m.properties.headers?.['x-delivery-count'] ?? 0) || 0;
    setTimeout(() => this.responder(() => canal.nack(m, false, true)), esperaParaReencolar(entregas)).unref();
  }

  /** ack o nack sobre un canal que pudo cerrarse mientras tanto: el broker reentrega solo lo que no se confirmó. */
  private responder(accion: () => void): void {
    try {
      accion();
    } catch (e) {
      this.log.warn(`No se pudo confirmar el mensaje (canal cerrado): ${(e as Error).message}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.apagando = true;
    await this.conexion?.close().catch(() => undefined);
  }
}
