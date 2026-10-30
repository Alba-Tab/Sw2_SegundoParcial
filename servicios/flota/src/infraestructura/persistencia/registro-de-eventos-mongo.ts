import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { RegistroDeEventos } from '../../aplicacion/puertos/registro-de-eventos';
import { uuid7 } from '../../dominio/comun/uuid7';
import { ValidadorEventos } from '../mensajeria/validador-eventos';
import { contexto, traceparentActual } from '../observabilidad/contexto';
import { sesionActual } from './mongo-unidad-de-trabajo';

export const OUTBOX = 'outboxEventos';
const SIETE_DIAS_S = 7 * 86_400;

/**
 * Pendientes del relay (índice parcial: solo las filas sin publicar, en orden de creación) y TTL de 7 días sobre las
 * publicadas; una fila sin publicar (publicadoEn null) nunca vence.
 */
export async function crearIndicesOutbox(conexion: Connection): Promise<void> {
  await conexion
    .collection(OUTBOX)
    .createIndex({ publicadoEn: 1, creadoEn: 1 }, { name: 'pendientes', partialFilterExpression: { publicadoEn: null } });
  await conexion.collection(OUTBOX).createIndex({ publicadoEn: 1 }, { name: 'publicadosVencen', expireAfterSeconds: SIETE_DIAS_S });
}

/**
 * Escribe el sobre común (000 §6) en outboxEventos con la sesión de la transacción en curso, después de validarlo
 * contra su esquema. correlationId y traceparent salen de la petición HTTP o del evento consumido (contexto); si no hay
 * ninguno (una actividad de Temporal, la revisión diaria), se generan.
 */
@Injectable()
export class RegistroDeEventosMongo implements RegistroDeEventos {
  constructor(
    @InjectConnection() private readonly conexion: Connection,
    private readonly validador: ValidadorEventos,
  ) {}

  async registrar(tipo: string, claveEnrutamiento: string, datos: unknown): Promise<void> {
    const sesion = sesionActual.getStore();
    if (!sesion?.inTransaction()) throw new Error('RegistroDeEventos.registrar se usa solo dentro de una UnidadDeTrabajo');
    const id = uuid7();
    const ahora = new Date();
    const sobre = {
      id,
      tipo,
      version: Number(claveEnrutamiento.slice(claveEnrutamiento.lastIndexOf('.v') + 2)),
      ocurridoEn: ahora.toISOString(),
      correlationId: contexto.getStore()?.correlationId ?? uuid7(),
      traceparent: traceparentActual(),
      productor: 'flota',
      datos,
    };
    this.validador.validar(tipo, sobre.version, sobre);
    await this.conexion
      .collection(OUTBOX)
      .insertOne(
        { _id: id as never, tipo, claveEnrutamiento, sobre, creadoEn: ahora, publicadoEn: null, reclamadoHasta: null },
        { session: sesion },
      );
  }
}
