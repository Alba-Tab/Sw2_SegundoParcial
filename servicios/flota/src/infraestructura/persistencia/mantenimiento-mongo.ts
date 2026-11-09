import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { MantenimientoRepositorio } from '../../aplicacion/puertos/mantenimiento-repositorio';
import type { OperacionesIdempotentes, OperacionIdempotente } from '../../aplicacion/puertos/operaciones-idempotentes';
import type { EstadoMantenimiento, Mantenimiento } from '../../dominio/mantenimiento/mantenimiento';
import { sesionActual } from './mongo-unidad-de-trabajo';

export const MANTENIMIENTOS = 'mantenimientos';
/** `operacion_idempotente` de 000 §9 en camelCase, como inboxEventos y outboxEventos. La clave va en `_id`. */
export const OPERACIONES = 'operacionIdempotente';

/** Un solo mantenimiento EN_CURSO por unidad (spec 010) y la lista por unidad. */
export async function crearIndicesMantenimiento(conexion: Connection): Promise<void> {
  await conexion
    .collection(MANTENIMIENTOS)
    .createIndex({ unidadId: 1 }, { unique: true, partialFilterExpression: { estado: 'EN_CURSO' }, name: 'unidadId_en_curso' });
  await conexion.collection(MANTENIMIENTOS).createIndex({ unidadId: 1, _id: -1 });
}

const opciones = () => ({ session: sesionActual.getStore() });

@Injectable()
export class MantenimientoRepositorioMongo implements MantenimientoRepositorio {
  constructor(@InjectConnection() private readonly conexion: Connection) {}

  private get col() {
    return this.conexion.collection<Omit<Mantenimiento, 'mantenimientoId'> & { _id: string }>(MANTENIMIENTOS);
  }

  async porId(mantenimientoId: string): Promise<Mantenimiento | null> {
    const d = await this.col.findOne({ _id: mantenimientoId }, opciones());
    return d ? aMantenimiento(d) : null;
  }

  async insertar(m: Mantenimiento): Promise<void> {
    const { mantenimientoId, ...resto } = m;
    await this.col.insertOne({ _id: mantenimientoId, ...resto }, opciones());
  }

  async guardar(m: Mantenimiento): Promise<void> {
    const { mantenimientoId, ...resto } = m;
    await this.col.replaceOne({ _id: mantenimientoId }, resto, opciones());
  }

  async listar(filtro: { unidadId?: string; estado?: EstadoMantenimiento }, antesDe: string | undefined, limite: number) {
    const q: Record<string, unknown> = {};
    if (filtro.unidadId) q.unidadId = filtro.unidadId;
    if (filtro.estado) q.estado = filtro.estado;
    if (antesDe) q._id = { $lt: antesDe };
    return (
      await this.col
        .find(q as never, opciones())
        .sort({ _id: -1 })
        .limit(limite)
        .toArray()
    ).map(aMantenimiento);
  }
}

@Injectable()
export class OperacionesIdempotentesMongo implements OperacionesIdempotentes {
  constructor(@InjectConnection() private readonly conexion: Connection) {}

  private get col() {
    return this.conexion.collection<Omit<OperacionIdempotente, 'clave'> & { _id: string; creadaEn: Date }>(OPERACIONES);
  }

  async buscar(clave: string): Promise<OperacionIdempotente | null> {
    const d = await this.col.findOne({ _id: clave }, opciones());
    if (!d) return null;
    return { clave: d._id, operacion: d.operacion, hashCuerpo: d.hashCuerpo, respuesta: d.respuesta };
  }

  async guardar({ clave, ...resto }: OperacionIdempotente): Promise<void> {
    await this.col.insertOne({ _id: clave, ...resto, creadaEn: new Date() }, opciones());
  }
}

function aMantenimiento({ _id, ...d }: Omit<Mantenimiento, 'mantenimientoId'> & { _id: string }): Mantenimiento {
  return { mantenimientoId: _id, ...d };
}
