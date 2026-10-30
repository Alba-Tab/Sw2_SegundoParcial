import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Connection } from 'mongoose';
import { CHOFERES, UNIDADES } from './colecciones-flota';

/** Fecha `YYYY-MM-DD` de hoy en La Paz más `dias` (las fechas de la semilla son relativas). */
export function diaDesdeHoy(dias: number, hoy = new Date()): string {
  const laPaz = new Date(hoy.toLocaleString('en-US', { timeZone: 'America/La_Paz' }));
  laPaz.setDate(laPaz.getDate() + dias);
  return `${laPaz.getFullYear()}-${String(laPaz.getMonth() + 1).padStart(2, '0')}-${String(laPaz.getDate()).padStart(2, '0')}`;
}

interface DocumentoSemilla {
  tipo: string;
  venceElDiasDesdeHoy: number;
}

/**
 * Carga la parte de Flota de plataforma/semilla (D102): unidades y choferes, directo en Mongo y sin Outbox (no publica
 * ChoferActualizado; Analítica carga los mismos archivos). Idempotente: reemplaza cada documento por su id.
 */
export async function cargarSemilla(conexion: Connection, dir: string): Promise<{ unidades: number; choferes: number }> {
  const leer = <T>(archivo: string): T[] => JSON.parse(readFileSync(join(dir, archivo), 'utf8')) as T[];
  const unidades = leer<{ unidadId: string; documentos: DocumentoSemilla[] } & Record<string, unknown>>('unidades.json');
  const choferes = leer<{ choferId: string; licenciaVenceElDiasDesdeHoy: number } & Record<string, unknown>>('choferes.json');
  for (const { unidadId, documentos, ...u } of unidades) {
    await conexion
      .collection(UNIDADES)
      .replaceOne(
        { _id: unidadId as never },
        { ...u, documentos: documentos.map((d) => ({ tipo: d.tipo, venceEl: diaDesdeHoy(d.venceElDiasDesdeHoy) })) },
        { upsert: true },
      );
  }
  for (const { choferId, licenciaVenceElDiasDesdeHoy, ...c } of choferes) {
    await conexion
      .collection(CHOFERES)
      .replaceOne(
        { _id: choferId as never },
        { ...c, licenciaVenceEl: diaDesdeHoy(licenciaVenceElDiasDesdeHoy), disponible: true, versionAgregado: 1 },
        { upsert: true },
      );
  }
  return { unidades: unidades.length, choferes: choferes.length };
}
