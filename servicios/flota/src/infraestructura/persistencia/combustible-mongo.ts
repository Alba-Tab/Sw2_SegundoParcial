import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { type Connection, mongo } from 'mongoose';
import type { CombustibleRepositorio, Deteccion } from '../../aplicacion/puertos/combustible-repositorio';
import type { Lectura } from '../../dominio/combustible/caida';
import type { CargaCombustible } from '../../dominio/combustible/carga';
import { Monto } from '../../dominio/comun/monto';
import { sesionActual } from './mongo-unidad-de-trabajo';

export const CARGAS = 'cargasCombustible';
export const LECTURAS = 'lecturasCombustible';
export const DETECCIONES = 'deteccionesCaida';
const TREINTA_DIAS_S = 30 * 86_400;

/**
 * opId único (autoridad de las cargas), una lectura por placa e instante, TTL de 30 días (D72), las lecturas en marcha
 * de cada placa (inicio de la parada) y una detección por parada.
 */
export async function crearIndicesCombustible(conexion: Connection): Promise<void> {
  await conexion.collection(CARGAS).createIndex({ opId: 1 }, { unique: true });
  await conexion.collection(CARGAS).createIndex({ tractoId: 1, registradaEn: 1 });
  await conexion.collection(LECTURAS).createIndex({ placa: 1, medidoEn: 1 }, { unique: true });
  await conexion.collection(LECTURAS).createIndex({ medidoEn: 1 }, { expireAfterSeconds: TREINTA_DIAS_S });
  await conexion
    .collection(LECTURAS)
    .createIndex({ placa: 1, medidoEn: -1 }, { name: 'enMarcha', partialFilterExpression: { velocidadKmh: { $gt: 0 } } });
  await conexion.collection(DETECCIONES).createIndex({ placa: 1, paradaDesde: 1 }, { unique: true });
}

const opciones = () => ({ session: sesionActual.getStore() });

const instante = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

/**
 * Instantes como Date (000 §2) y el dinero como Decimal128 (000 §3); hacia afuera, texto ISO y el monto con 2 decimales.
 * Un documento anterior con texto en esos campos se sigue leyendo.
 */
function aCarga(d: mongo.WithId<mongo.Document>): CargaCombustible & { hashCuerpo: string } {
  const { _id, monto, registradaEn, ...resto } = d;
  return {
    cargaId: String(_id),
    ...resto,
    monto: Monto.bob(String(monto.monto)).aContrato(),
    registradaEn: instante(registradaEn),
  } as CargaCombustible & { hashCuerpo: string };
}

@Injectable()
export class CombustibleRepositorioMongo implements CombustibleRepositorio {
  constructor(@InjectConnection() private readonly conexion: Connection) {}

  async cargaPorOpId(opId: string) {
    const d = await this.conexion.collection(CARGAS).findOne({ opId }, opciones());
    return d ? aCarga(d) : null;
  }

  async insertarCarga(c: CargaCombustible, hashCuerpo: string): Promise<void> {
    const { cargaId, monto, registradaEn, ...resto } = c;
    await this.conexion.collection(CARGAS).insertOne(
      {
        _id: cargaId as never,
        ...resto,
        monto: { monto: mongo.Decimal128.fromString(monto.monto), moneda: monto.moneda },
        registradaEn: new Date(registradaEn),
        hashCuerpo,
      },
      opciones(),
    );
  }

  async listarCargas(
    filtro: { tractoId?: string; choferId?: string; desde?: string; hasta?: string },
    despuesDe: string | undefined,
    limite: number,
  ) {
    const q: Record<string, unknown> = {};
    if (filtro.tractoId) q.tractoId = filtro.tractoId;
    if (filtro.choferId) q.choferId = filtro.choferId;
    if (filtro.desde || filtro.hasta) {
      q.registradaEn = {
        ...(filtro.desde ? { $gte: new Date(filtro.desde) } : {}),
        ...(filtro.hasta ? { $lte: new Date(filtro.hasta) } : {}),
      };
    }
    if (despuesDe) q._id = { $gt: despuesDe };
    const docs = await this.conexion.collection(CARGAS).find(q, opciones()).sort({ _id: 1 }).limit(limite).toArray();
    return docs.map((d) => {
      const { hashCuerpo: _h, ...carga } = aCarga(d);
      return carga;
    });
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

  async inicioDeParada(placa: string, hasta: string): Promise<string> {
    const lecturas = this.conexion.collection(LECTURAS);
    const t = new Date(hasta);
    const enMarcha = await lecturas.findOne(
      { placa, velocidadKmh: { $gt: 0 }, medidoEn: { $lt: t } },
      { sort: { medidoEn: -1 }, projection: { medidoEn: 1 } },
    );
    const primera = await lecturas.findOne(
      { placa, medidoEn: { ...(enMarcha ? { $gt: enMarcha.medidoEn as Date } : {}), $lte: t } },
      { sort: { medidoEn: 1 }, projection: { medidoEn: 1 } },
    );
    return primera ? (primera.medidoEn as Date).toISOString() : t.toISOString();
  }

  async deteccionDeParada(placa: string, paradaDesde: string): Promise<boolean> {
    return (await this.conexion.collection(DETECCIONES).countDocuments({ placa, paradaDesde: new Date(paradaDesde) }, opciones())) > 0;
  }

  async insertarDeteccion(d: Deteccion): Promise<void> {
    const { deteccionId, detectadaEn, paradaDesde, ...resto } = d;
    await this.conexion
      .collection(DETECCIONES)
      .insertOne(
        { _id: deteccionId as never, ...resto, detectadaEn: new Date(detectadaEn), paradaDesde: new Date(paradaDesde) },
        opciones(),
      );
  }
}
