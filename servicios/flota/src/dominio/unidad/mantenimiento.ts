import type { Unidad } from './unidad';

/** D07: mantenimiento por km o documentos por vencer (spec 010, regla C). */
export const KM_PARA_MANTENIMIENTO = 10_000;
export const DIAS_DE_AVISO = 15;

export type MotivoMantenimiento = 'KILOMETRAJE' | 'SOAT' | 'INSPECCION';

export interface Revision {
  motivos: MotivoMantenimiento[];
  /** El vencimiento más cercano de los documentos que motivaron la revisión. */
  documentoVenceEl?: string;
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/** Regla C de la spec 010 con la fecha de hoy (YYYY-MM-DD en La Paz). El documento INSPECCION_TECNICA es el motivo INSPECCION. */
export function revisar(u: Unidad, hoy: string): Revision {
  const motivos: MotivoMantenimiento[] = [];
  if (u.kmDesdeUltimoMantenimiento >= KM_PARA_MANTENIMIENTO) motivos.push('KILOMETRAJE');
  const vencimientos: string[] = [];
  for (const [tipo, motivo] of [
    ['SOAT', 'SOAT'],
    ['INSPECCION_TECNICA', 'INSPECCION'],
  ] as const) {
    const d = u.documentos.find((x) => x.tipo === tipo);
    if (d && diasEntre(hoy, d.venceEl) <= DIAS_DE_AVISO) {
      motivos.push(motivo);
      vencimientos.push(d.venceEl);
    }
  }
  return { motivos, ...(vencimientos.length ? { documentoVenceEl: vencimientos.sort()[0] } : {}) };
}

/**
 * Al terminar el viaje (EntregaConfirmada o EntregaRechazada): suma los km de la ruta (D07; el odómetro no cambia) y
 * pasa a DISPONIBLE o MANTENIMIENTO_PENDIENTE, desde EN_VIAJE o desde RESERVADA si ViajeIniciado no llegó todavía.
 */
export function liberarDespuesDelViaje(u: Unidad, kmRecorridos: number, hoy: string): { unidad: Unidad; revision: Revision } | null {
  if (u.estado !== 'EN_VIAJE' && u.estado !== 'RESERVADA') return null;
  const km = u.kmDesdeUltimoMantenimiento + kmRecorridos;
  const revision = revisar({ ...u, kmDesdeUltimoMantenimiento: km }, hoy);
  return {
    unidad: { ...u, kmDesdeUltimoMantenimiento: km, estado: revision.motivos.length ? 'MANTENIMIENTO_PENDIENTE' : 'DISPONIBLE' },
    revision,
  };
}

/** Datos de MantenimientoRequerido.v1 para una unidad que quedó MANTENIMIENTO_PENDIENTE. */
export function mantenimientoRequerido(u: Unidad, revision: Revision) {
  return {
    unidadId: u.unidadId,
    tipoUnidad: u.tipoUnidad,
    placa: u.placa,
    motivos: revision.motivos,
    kmDesdeUltimo: u.kmDesdeUltimoMantenimiento,
    ...(revision.documentoVenceEl ? { documentoVenceEl: revision.documentoVenceEl } : {}),
  };
}
