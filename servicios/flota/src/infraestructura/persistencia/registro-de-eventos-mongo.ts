import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { RegistroDeEventos } from '../../aplicacion/puertos/registro-de-eventos';
import { uuid7 } from '../../dominio/comun/uuid7';
import { randomBytes } from 'node:crypto';
import { ValidadorEventos } from '../mensajeria/validador-eventos';
import { contexto } from '../observabilidad/contexto';
import { sesionActual } from './mongo-unidad-de-trabajo';

export const OUTBOX = 'outboxEventos';

/**
 * Escribe el sobre común (000 §6) en outboxEventos con la sesión de la transacción en curso, después de validarlo
 * contra su esquema. correlationId y traceparent son obligatorios: si no hay petición en curso (un consumidor, una
 * actividad), se generan.
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
      traceparent: `00-${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-01`,
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
