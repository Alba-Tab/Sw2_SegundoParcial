import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { ChoferRepositorio } from '../../aplicacion/puertos/chofer-repositorio';
import type { ReservaUnidadRepositorio } from '../../aplicacion/puertos/reserva-unidad-repositorio';
import type { UnidadRepositorio } from '../../aplicacion/puertos/unidad-repositorio';
import type { ReservaUnidad } from '../../dominio/reserva/reserva-unidad';
import type { Chofer } from '../../dominio/unidad/chofer';
import type { Unidad } from '../../dominio/unidad/unidad';
import { crearIndicesCombustible } from './combustible-mongo';
import { sesionActual } from './mongo-unidad-de-trabajo';

/** Colecciones de Flota en camelCase plural (000 §9); el id de negocio va en `_id`. */
export const UNIDADES = 'unidades';
export const CHOFERES = 'choferes';
export const RESERVAS = 'reservasUnidad';

type ConId<T, K extends keyof T> = Omit<T, K> & { _id: string };

const opciones = () => ({ session: sesionActual.getStore() });

/** Índices que hacen cumplir las reglas: placa única (spec 010) y una reserva por servicio (spec 003). */
export async function crearIndicesFlota(conexion: Connection): Promise<void> {
  await conexion.collection(UNIDADES).createIndex({ placa: 1 }, { unique: true });
  await conexion.collection(UNIDADES).createIndex({ estado: 1, tipoUnidad: 1 });
  await conexion.collection(RESERVAS).createIndex({ servicioId: 1 }, { unique: true });
  await conexion.collection(RESERVAS).createIndex({ viajeId: 1 });
  await crearIndicesCombustible(conexion);
}

@Injectable()
export class UnidadRepositorioMongo implements UnidadRepositorio {
  constructor(@InjectConnection() private readonly conexion: Connection) {}

  private get col() {
    return this.conexion.collection<ConId<Unidad, 'unidadId'>>(UNIDADES);
  }

  async porId(unidadId: string): Promise<Unidad | null> {
    const d = await this.col.findOne({ _id: unidadId }, opciones());
    return d ? aUnidad(d) : null;
  }

  async disponibles(): Promise<Unidad[]> {
    return (await this.col.find({ estado: 'DISPONIBLE' }, opciones()).toArray()).map(aUnidad);
  }

  async porPlaca(placa: string): Promise<Unidad | null> {
    const d = await this.col.findOne({ placa }, opciones());
    return d ? aUnidad(d) : null;
  }

  async tomar(unidadId: string): Promise<boolean> {
    const r = await this.col.updateOne({ _id: unidadId, estado: 'DISPONIBLE' }, { $set: { estado: 'RESERVADA' } }, opciones());
    return r.modifiedCount === 1;
  }

  async devolver(unidadId: string): Promise<void> {
    await this.col.updateOne({ _id: unidadId, estado: 'RESERVADA' }, { $set: { estado: 'DISPONIBLE' } }, opciones());
  }

  async ponerEnViaje(unidadId: string): Promise<void> {
    await this.col.updateOne({ _id: unidadId, estado: 'RESERVADA' }, { $set: { estado: 'EN_VIAJE' } }, opciones());
  }

  async guardar(u: Unidad): Promise<void> {
    const { unidadId, ...resto } = u;
    await this.col.replaceOne({ _id: unidadId }, resto, opciones());
  }

  async listar(filtro: { tipo?: string; estado?: string }, despuesDe: string | undefined, limite: number): Promise<Unidad[]> {
    const q: Record<string, unknown> = {};
    if (filtro.tipo) q.tipoUnidad = filtro.tipo;
    if (filtro.estado) q.estado = filtro.estado;
    if (despuesDe) q._id = { $gt: despuesDe };
    return (
      await this.col
        .find(q as never, opciones())
        .sort({ _id: 1 })
        .limit(limite)
        .toArray()
    ).map(aUnidad);
  }
}

@Injectable()
export class ChoferRepositorioMongo implements ChoferRepositorio {
  constructor(@InjectConnection() private readonly conexion: Connection) {}

  private get col() {
    return this.conexion.collection<ConId<Chofer, 'choferId'>>(CHOFERES);
  }

  async porId(choferId: string): Promise<Chofer | null> {
    const d = await this.col.findOne({ _id: choferId }, opciones());
    return d ? aChofer(d) : null;
  }

  async disponibles(): Promise<Chofer[]> {
    return (await this.col.find({ disponible: true, activo: true }, opciones()).toArray()).map(aChofer);
  }

  async tomar(choferId: string): Promise<boolean> {
    const r = await this.col.updateOne({ _id: choferId, disponible: true }, { $set: { disponible: false } }, opciones());
    return r.modifiedCount === 1;
  }

  async devolver(choferId: string): Promise<void> {
    await this.col.updateOne({ _id: choferId }, { $set: { disponible: true } }, opciones());
  }

  async porUsuarioSub(sub: string) {
    const d = await this.col.findOne({ usuarioSub: sub }, opciones());
    return d ? (aChofer(d) as Chofer & { versionAgregado: number }) : null;
  }

  async guardar(c: Chofer & { versionAgregado: number }): Promise<void> {
    const { choferId, ...resto } = c;
    await this.col.replaceOne({ _id: choferId }, resto, opciones());
  }

  async listar(filtro: { activo?: boolean }, despuesDe: string | undefined, limite: number): Promise<Chofer[]> {
    const q: Record<string, unknown> = {};
    if (filtro.activo !== undefined) q.activo = filtro.activo;
    if (despuesDe) q._id = { $gt: despuesDe };
    return (
      await this.col
        .find(q as never, opciones())
        .sort({ _id: 1 })
        .limit(limite)
        .toArray()
    ).map(aChofer);
  }
}

@Injectable()
export class ReservaUnidadRepositorioMongo implements ReservaUnidadRepositorio {
  constructor(@InjectConnection() private readonly conexion: Connection) {}

  private get col() {
    return this.conexion.collection<ConId<ReservaUnidad, 'reservaUnidadId'>>(RESERVAS);
  }

  async porServicio(servicioId: string): Promise<ReservaUnidad | null> {
    const d = await this.col.findOne({ servicioId }, opciones());
    if (!d) return null;
    const { _id, ...resto } = d;
    return { reservaUnidadId: _id, ...resto };
  }

  async porViaje(viajeId: string): Promise<ReservaUnidad | null> {
    const d = await this.col.findOne({ viajeId }, opciones());
    if (!d) return null;
    const { _id, ...resto } = d;
    return { reservaUnidadId: _id, ...resto };
  }

  async activaDeUnidad(unidadId: string): Promise<ReservaUnidad | null> {
    const d = await this.col.findOne(
      { estado: { $in: ['PROVISIONAL', 'CONFIRMADA'] }, $or: [{ tractoId: unidadId }, { remolqueId: unidadId }] },
      opciones(),
    );
    if (!d) return null;
    const { _id, ...resto } = d;
    return { reservaUnidadId: _id, ...resto };
  }

  async insertar(r: ReservaUnidad): Promise<void> {
    const { reservaUnidadId, ...resto } = r;
    await this.col.insertOne({ _id: reservaUnidadId, ...resto }, opciones());
  }

  async actualizar(r: ReservaUnidad): Promise<void> {
    const { reservaUnidadId, ...resto } = r;
    await this.col.replaceOne({ _id: reservaUnidadId }, resto, opciones());
  }
}

function aUnidad({ _id, ...d }: ConId<Unidad, 'unidadId'>): Unidad {
  return { unidadId: _id, ...d };
}

function aChofer({ _id, ...d }: ConId<Chofer, 'choferId'>): Chofer {
  return { choferId: _id, ...d };
}
