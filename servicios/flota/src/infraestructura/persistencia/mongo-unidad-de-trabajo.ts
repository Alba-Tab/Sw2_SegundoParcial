import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { ClientSession, Connection } from 'mongoose';
import type { UnidadDeTrabajo } from '../../aplicacion/puertos/unidad-de-trabajo';

/** Transacción de Mongo (réplica rs0) con la sesión en un AsyncLocalStorage para los repositorios y el Outbox. */
export const sesionActual = new AsyncLocalStorage<ClientSession>();

@Injectable()
export class MongoUnidadDeTrabajo implements UnidadDeTrabajo {
  constructor(@InjectConnection() private readonly conexion: Connection) {}

  ejecutar<T>(trabajo: () => Promise<T>): Promise<T> {
    return this.conexion.transaction((sesion) => sesionActual.run(sesion, trabajo));
  }
}
