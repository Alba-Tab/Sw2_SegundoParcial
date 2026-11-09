import { ErrorDeDominio } from '../comun/error-de-dominio';
import { validarDocumentos } from '../unidad/gestion';
import { type Revision, revisar } from '../unidad/mantenimiento';
import type { Documento, Unidad } from '../unidad/unidad';

/** Spec 010, sección E (CU-10): EN_CURSO → CERRADO. DOCUMENTOS no reinicia los km. */
export type TipoMantenimiento = 'PREVENTIVO' | 'CORRECTIVO' | 'DOCUMENTOS';
export type EstadoMantenimiento = 'EN_CURSO' | 'CERRADO';

export interface ItemChecklist {
  item: string;
  ok?: boolean;
  nota?: string;
}

export interface Mantenimiento {
  mantenimientoId: string;
  unidadId: string;
  placa: string;
  tipo: TipoMantenimiento;
  estado: EstadoMantenimiento;
  fechaProgramada: string;
  taller: string;
  descripcion: string;
  checklist: ItemChecklist[];
  programadoEn: string;
  programadoPor: string;
  cerradoEn?: string;
  kilometraje?: number;
  observaciones?: string;
  documentosRenovados?: Documento[];
}

export interface MantenimientoNuevo {
  tipo: TipoMantenimiento;
  fechaProgramada: string;
  taller: string;
  descripcion: string;
  checklist: { item: string }[];
}

export interface Cierre {
  kilometraje?: number;
  checklist: { item: string; ok: boolean; nota?: string }[];
  observaciones?: string;
  documentosRenovados?: Documento[];
}

/** Programar: la unidad DISPONIBLE o MANTENIMIENTO_PENDIENTE pasa a EN_MANTENIMIENTO. */
export function programar(
  u: Unidad,
  e: MantenimientoNuevo,
  mantenimientoId: string,
  hoy: string,
  ahora: Date,
  sub: string,
): { unidad: Unidad; mantenimiento: Mantenimiento } {
  if (u.estado !== 'DISPONIBLE' && u.estado !== 'MANTENIMIENTO_PENDIENTE') {
    throw new ErrorDeDominio('CONFLICTO_ESTADO', `La unidad está ${u.estado} y no puede entrar a mantenimiento`, {
      estadoActual: u.estado,
    });
  }
  if (e.fechaProgramada < hoy) invalido('fechaProgramada', 'debe ser hoy o después');
  const items = e.checklist.map((i) => i.item.trim());
  if (items.some((i) => !i) || new Set(items).size !== items.length) invalido('checklist', 'los ítems deben ser distintos y no vacíos');
  return {
    unidad: { ...u, estado: 'EN_MANTENIMIENTO' },
    mantenimiento: {
      mantenimientoId,
      unidadId: u.unidadId,
      placa: u.placa,
      tipo: e.tipo,
      estado: 'EN_CURSO',
      fechaProgramada: e.fechaProgramada,
      taller: e.taller.trim(),
      descripcion: e.descripcion,
      checklist: items.map((item) => ({ item })),
      programadoEn: ahora.toISOString(),
      programadoPor: sub,
    },
  };
}

/**
 * Cerrar: el checklist completo y en orden, el odómetro del tracto, los documentos renovados y los km en 0 si fue
 * PREVENTIVO o CORRECTIVO. La unidad vuelve a DISPONIBLE o, si todavía cumple la regla C, a MANTENIMIENTO_PENDIENTE.
 */
export function cerrar(
  m: Mantenimiento,
  u: Unidad,
  e: Cierre,
  hoy: string,
  ahora: Date,
): { mantenimiento: Mantenimiento; unidad: Unidad; revision: Revision } {
  if (m.estado !== 'EN_CURSO' || u.estado !== 'EN_MANTENIMIENTO') {
    throw new ErrorDeDominio('CONFLICTO_ESTADO', `El mantenimiento está ${m.estado} y la unidad ${u.estado}`, { estadoActual: m.estado });
  }
  if (u.tipoUnidad === 'TRACTO') {
    if (e.kilometraje === undefined) invalido('kilometraje', 'es obligatorio en tractos');
    if (e.kilometraje < (u.kilometraje ?? 0)) {
      throw new ErrorDeDominio('KILOMETRAJE_INVALIDO', `El odómetro no puede bajar de ${u.kilometraje} km`, { campo: 'kilometraje' });
    }
  } else if (e.kilometraje !== undefined) {
    invalido('kilometraje', 'el odómetro es solo de tractos');
  }
  const recibidos = new Map(e.checklist.map((i) => [i.item.trim(), i]));
  for (const { item } of m.checklist) {
    const r = recibidos.get(item);
    if (!r) invalido('checklist', `falta el ítem "${item}"`);
    if (!r.ok) invalido('checklist', `el ítem "${item}" no está listo`);
  }
  if (recibidos.size !== m.checklist.length) invalido('checklist', 'trae ítems que no se programaron');

  const renovados = e.documentosRenovados ?? [];
  if (new Set(renovados.map((d) => d.tipo)).size !== renovados.length) invalido('documentosRenovados', 'un documento por tipo');
  const documentos = u.documentos.map((d) => renovados.find((r) => r.tipo === d.tipo) ?? d);
  validarDocumentos(documentos);

  const reiniciaKm = m.tipo === 'PREVENTIVO' || m.tipo === 'CORRECTIVO';
  const revisada: Unidad = {
    ...u,
    ...(u.tipoUnidad === 'TRACTO' ? { kilometraje: e.kilometraje } : {}),
    kmDesdeUltimoMantenimiento: reiniciaKm ? 0 : u.kmDesdeUltimoMantenimiento,
    documentos,
  };
  const revision = revisar(revisada, hoy);
  return {
    mantenimiento: {
      ...m,
      estado: 'CERRADO',
      checklist: m.checklist.map(({ item }) => {
        const r = recibidos.get(item)!;
        return { item, ok: true, ...(r.nota ? { nota: r.nota } : {}) };
      }),
      cerradoEn: ahora.toISOString(),
      ...(e.kilometraje !== undefined ? { kilometraje: e.kilometraje } : {}),
      ...(e.observaciones ? { observaciones: e.observaciones } : {}),
      ...(renovados.length ? { documentosRenovados: renovados } : {}),
    },
    unidad: { ...revisada, estado: revision.motivos.length ? 'MANTENIMIENTO_PENDIENTE' : 'DISPONIBLE' },
    revision,
  };
}

function invalido(campo: string, mensaje: string): never {
  throw new ErrorDeDominio('VALIDACION', `${campo}: ${mensaje}`, { campo });
}
