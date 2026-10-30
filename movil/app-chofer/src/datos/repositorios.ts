import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Cola, PuntosGps, Viajes } from '../aplicacion/puertos';
import type { PuntoGps } from '../dominio/gps';
import type { EstadoOperacion, Operacion, TipoOperacion } from '../dominio/operacion';
import type { EstadoViaje, ViajeLocal } from '../dominio/viaje';
import { bd } from './bd';
import { ajuste, operacionPendiente, puntoGps, viaje } from './esquema';

/** Adaptadores SQLite (Drizzle) de los puertos de la cola, el GPS y los viajes. Síncronos: SQLite está en el celular. */
export class ColaSqlite implements Cola {
  todas(): Operacion[] {
    return bd
      .select()
      .from(operacionPendiente)
      .where(eq(operacionPendiente.estado, 'PENDIENTE'))
      .orderBy(asc(operacionPendiente.creadaEn))
      .all()
      .map(aOperacion);
  }

  /** Para la pantalla de pendientes: todas menos las confirmadas. */
  visibles(): Operacion[] {
    return bd
      .select()
      .from(operacionPendiente)
      .where(sql`${operacionPendiente.estado} <> 'CONFIRMADA'`)
      .orderBy(asc(operacionPendiente.creadaEn))
      .all()
      .map(aOperacion);
  }

  agregar(op: Operacion): void {
    bd.insert(operacionPendiente)
      .values({ ...op, cuerpo: JSON.stringify(op.cuerpo) })
      .run();
  }

  actualizar(op: Operacion): void {
    bd.update(operacionPendiente)
      .set({
        intentos: op.intentos,
        proximoIntentoEn: op.proximoIntentoEn,
        estado: op.estado,
        codigoError: op.codigoError,
        cerradaEn: op.cerradaEn,
      })
      .where(eq(operacionPendiente.opId, op.opId))
      .run();
  }

  descartarViaje(viajeId: string, ahora: string): void {
    bd.update(operacionPendiente)
      .set({ estado: 'DESCARTADA', cerradaEn: ahora })
      .where(and(eq(operacionPendiente.viajeId, viajeId), eq(operacionPendiente.estado, 'PENDIENTE')))
      .run();
  }

  purgar(antesDe: string): void {
    bd.delete(operacionPendiente)
      .where(and(inArray(operacionPendiente.estado, ['DESCARTADA', 'CONFIRMADA']), lte(operacionPendiente.cerradaEn, antesDe)))
      .run();
  }
}

function aOperacion(f: typeof operacionPendiente.$inferSelect): Operacion {
  return {
    ...f,
    tipo: f.tipo as TipoOperacion,
    estado: f.estado as EstadoOperacion,
    cuerpo: JSON.parse(f.cuerpo) as Record<string, unknown>,
  };
}

export class PuntosSqlite implements PuntosGps {
  siguienteSeq(viajeId: string): number {
    const clave = `seq:${viajeId}`;
    const actual = Number(bd.select().from(ajuste).where(eq(ajuste.clave, clave)).get()?.valor ?? -1) + 1;
    bd.insert(ajuste)
      .values({ clave, valor: String(actual) })
      .onConflictDoUpdate({ target: ajuste.clave, set: { valor: String(actual) } })
      .run();
    return actual;
  }

  agregar(p: PuntoGps): void {
    bd.insert(puntoGps).values(p).onConflictDoNothing().run();
  }

  pendientes(viajeId: string, limite: number): PuntoGps[] {
    return bd.select().from(puntoGps).where(eq(puntoGps.viajeId, viajeId)).orderBy(asc(puntoGps.seq)).limit(limite).all();
  }

  viajes(): string[] {
    return bd
      .selectDistinct({ viajeId: puntoGps.viajeId })
      .from(puntoGps)
      .all()
      .map((f) => f.viajeId);
  }

  borrar(viajeId: string, seqs: number[]): void {
    if (seqs.length === 0) return;
    bd.delete(puntoGps)
      .where(and(eq(puntoGps.viajeId, viajeId), inArray(puntoGps.seq, seqs)))
      .run();
  }

  borrarHasta(viajeId: string, seq: number): void {
    bd.delete(puntoGps)
      .where(and(eq(puntoGps.viajeId, viajeId), lte(puntoGps.seq, seq)))
      .run();
  }

  contar(): number {
    return (
      bd
        .select({ n: sql<number>`count(*)` })
        .from(puntoGps)
        .get()?.n ?? 0
    );
  }
}

type DatosViaje = Omit<ViajeLocal, 'viajeId' | 'estado' | 'iniciadoLocal' | 'canceladoAlSincronizar'>;

export class ViajesSqlite implements Viajes {
  todos(): ViajeLocal[] {
    return bd.select().from(viaje).all().map(aViaje);
  }

  porId(viajeId: string): ViajeLocal | null {
    const f = bd.select().from(viaje).where(eq(viaje.viajeId, viajeId)).get();
    return f ? aViaje(f) : null;
  }

  guardarDelServidor(viajes: ViajeLocal[]): void {
    const ahora = new Date().toISOString();
    bd.transaction((tx) => {
      for (const v of viajes) {
        const { viajeId, estado, iniciadoLocal: _i, canceladoAlSincronizar: _c, ...datos } = v;
        tx.insert(viaje)
          .values({ viajeId, estado, datos: JSON.stringify(datos), actualizadoEn: ahora })
          // El servidor manda en el estado; "iniciado sin señal" se conserva hasta que el inicio se confirme.
          .onConflictDoUpdate({ target: viaje.viajeId, set: { estado, datos: JSON.stringify(datos), actualizadoEn: ahora } })
          .run();
      }
    });
  }

  marcarIniciado(viajeId: string): void {
    bd.update(viaje).set({ iniciadoLocal: true }).where(eq(viaje.viajeId, viajeId)).run();
  }

  marcarCanceladoAlSincronizar(viajeId: string): void {
    bd.update(viaje).set({ canceladoAlSincronizar: true }).where(eq(viaje.viajeId, viajeId)).run();
  }
}

function aViaje(f: typeof viaje.$inferSelect): ViajeLocal {
  return {
    viajeId: f.viajeId,
    estado: f.estado as EstadoViaje,
    iniciadoLocal: f.iniciadoLocal,
    canceladoAlSincronizar: f.canceladoAlSincronizar,
    ...(JSON.parse(f.datos) as DatosViaje),
  };
}
