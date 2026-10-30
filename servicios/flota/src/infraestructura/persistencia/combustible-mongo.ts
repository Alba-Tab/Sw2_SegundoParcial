import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { CombustibleRepositorio, Deteccion } from '../../aplicacion/puertos/combustible-repositorio';
import type { Lectura } from '../../dominio/combustible/caida';
import type { CargaCombustible } from '../../dominio/combustible/carga';
import { sesionActual } from './mongo-unidad-de-trabajo';

export const CARGAS = 'cargasCombustible';
export const LECTURAS = 'lecturasCombustible';
export const DETECCIONES = 'deteccionesCaida';
const TREINTA_DIAS_S = 30 * 86_400;

/** opId único (autoridad de las cargas), una lectura por placa e instante, TTL de 30 días (D72) y una detección por parada. */
export async function crearIndicesCombustible(conexion: Connection): Promise<void> {
  await conexion.collection(CARGAS).createIndex({ opId: 1 }, { unique: true });
  await conexion.collection(CARGAS).createIndex({ tractoId: 1, registradaEn: 1 });
  await conexion.collection(LECTURAS).createIndex({ placa: 1, medidoEn: 1 }, { unique: true });
  await conexion.collection(LECTURAS).createIndex({ medidoEn: 1 }, { expireAfterSeconds: TREINTA_DIAS_S });
  await conexion.collection(DETECCIONES).createIndex({ placa: 1, paradaDesde: 1 }, { unique: true });
}

const opciones = () => ({ session: sesionActual.getStore() });

@Injectable()
export class CombustibleRepositorioMongo implements CombustibleRepositorio {
  constructor(@InjectConnection() private readonly conexion: Connection) {}

  async cargaPorOpId(opId: string) {
    const d = await this.conexion.collection(CARGAS).findOne({ opId }, opciones());
    if (!d) return null;
    const { _id, ...resto } = d;
    return { cargaId: String(_id), ...resto } as CargaCombustible & { hashCuerpo: string };
  }

  async insertarCarga(c: CargaCombustible, hashCuerpo: string): Promise<void> {
    const { cargaId, ...resto } = c;
    await this.conexion.collection(CARGAS).insertOne({ _id: cargaId as never, ...resto, hashCuerpo }, opciones());
  }

  async listarCargas(
    filtro: { tractoId?: string; choferId?: string; desde?: string; hasta?: string },
    despuesDe: string | undefined,
    limite: number,
  ) {
    const q: Record<string, unknown> = {};
    if (filtro.tractoId) q.tractoId = filtro.tractoId;
    if (filtro.choferId) q.choferId = filtro.choferId;
    if (filtro.desde || filtro.hasta)
      q.registradaEn = { ...(filtro.desde ? { $gte: filtro.desde } : {}), ...(filtro.hasta ? { $lte: filtro.hasta } : {}) };
    if (despuesDe) q._id = { $gt: despuesDe };
    const docs = await this.conexion.collection(CARGAS).find(q, opciones()).sort({ _id: 1 }).limit(limite).toArray();
    return docs.map(({ _id, hashCuerpo: _h, ...resto }) => ({ cargaId: String(_id), ...resto }) as CargaCombustible);
  }

  async insertarLectura(l: Lectura): Promise<boolean> {
    try {
      await this.conexion.collection(LECTURAS).insertOne({ ...l, medidoEn: new Date(l.medidoEn) });
      return true;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return false; // fuera de transacción: la repetida se ignora
      throw e;
    }
  }

  async lecturasDesde(placa: string, desde: string, hasta?: string): Promise<Lectura[]> {
    const medidoEn = { $gte: new Date(desde), ...(hasta ? { $lte: new Date(hasta) } : {}) };
    const docs = await this.conexion.collection(LECTURAS).find({ placa, medidoEn }).sort({ medidoEn: 1 }).toArray();
    return docs.map((d) => ({
      placa: d.placa,
      nivelPct: d.nivelPct,
      velocidadKmh: d.velocidadKmh,
      medidoEn: (d.medidoEn as Date).toISOString(),
      ...(d.capacidadLitros !== undefined ? { capacidadLitros: d.capacidadLitros } : {}),
    }));
  }

  async deteccionDeParada(placa: string, paradaDesde: string): Promise<boolean> {
    return (await this.conexion.collection(DETECCIONES).countDocuments({ placa, paradaDesde }, opciones())) > 0;
  }

  async insertarDeteccion(d: Deteccion): Promise<void> {
    const { deteccionId, ...resto } = d;
    await this.conexion.collection(DETECCIONES).insertOne({ _id: deteccionId as never, ...resto }, opciones());
  }
}
