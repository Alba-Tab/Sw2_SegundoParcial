import { ErrorDeDominio } from '../comun/error-de-dominio';
import { validarAtributos } from './atributos';
import { type Revision, revisar } from './mantenimiento';
import type { Documento, TipoRemolque, TipoUnidad, Unidad } from './unidad';

/** Spec 010, sección A (CU-09): alta, edición y baja de unidades. */
export interface UnidadNueva {
  tipoUnidad: TipoUnidad;
  placa: string;
  tipoRemolque?: TipoRemolque;
  capacidadToneladas?: number;
  kilometraje?: number;
  kmDesdeUltimoMantenimiento: number;
  documentos: Documento[];
  atributos: Record<string, unknown>;
}

export interface EdicionUnidad {
  capacidadToneladas?: number;
  documentos: Documento[];
  atributos: Record<string, unknown>;
}

const NO_EDITABLES = ['RESERVADA', 'EN_VIAJE', 'EN_MANTENIMIENTO', 'INACTIVA'];

/** Alta: DISPONIBLE, o MANTENIMIENTO_PENDIENTE si ya cumple la regla C. */
export function nuevaUnidad(e: UnidadNueva, unidadId: string, hoy: string): { unidad: Unidad; revision: Revision } {
  if (e.tipoUnidad === 'TRACTO') {
    if (e.tipoRemolque !== undefined) invalido('tipoRemolque', 'solo en remolques');
    if (e.capacidadToneladas !== undefined) invalido('capacidadToneladas', 'solo en remolques');
  } else {
    if (e.tipoRemolque === undefined) invalido('tipoRemolque', 'es obligatorio en remolques');
    if (e.kilometraje !== undefined) invalido('kilometraje', 'el odómetro es solo de tractos');
  }
  validarCapacidad(e.tipoUnidad, e.capacidadToneladas);
  validarDocumentos(e.documentos);
  validarAtributos(e.tipoUnidad, e.tipoRemolque, e.atributos);
  const base: Unidad = {
    unidadId,
    tipoUnidad: e.tipoUnidad,
    placa: e.placa,
    ...(e.tipoRemolque ? { tipoRemolque: e.tipoRemolque, capacidadToneladas: e.capacidadToneladas } : {}),
    estado: 'DISPONIBLE',
    ...(e.tipoUnidad === 'TRACTO' ? { kilometraje: e.kilometraje ?? 0 } : {}),
    kmDesdeUltimoMantenimiento: e.kmDesdeUltimoMantenimiento,
    documentos: e.documentos,
    atributos: e.atributos,
  };
  const revision = revisar(base, hoy);
  return { unidad: { ...base, estado: revision.motivos.length ? 'MANTENIMIENTO_PENDIENTE' : 'DISPONIBLE' }, revision };
}

/**
 * Edición del documento salvo estado, placa y kilómetros. Una MANTENIMIENTO_PENDIENTE que ya no cumple la regla C (por
 * ejemplo, con el SOAT renovado) vuelve a DISPONIBLE.
 */
export function editarUnidad(u: Unidad, e: EdicionUnidad, hoy: string): Unidad {
  if (NO_EDITABLES.includes(u.estado)) {
    throw new ErrorDeDominio('CONFLICTO_ESTADO', `La unidad está ${u.estado} y no se puede editar`, { estadoActual: u.estado });
  }
  validarCapacidad(u.tipoUnidad, e.capacidadToneladas);
  validarDocumentos(e.documentos);
  validarAtributos(u.tipoUnidad, u.tipoRemolque, e.atributos);
  const editada: Unidad = {
    ...u,
    ...(u.tipoUnidad === 'REMOLQUE' ? { capacidadToneladas: e.capacidadToneladas } : {}),
    documentos: e.documentos,
    atributos: e.atributos,
  };
  if (u.estado === 'MANTENIMIENTO_PENDIENTE' && revisar(editada, hoy).motivos.length === 0) editada.estado = 'DISPONIBLE';
  return editada;
}

/** Baja: INACTIVA (final), solo desde DISPONIBLE o MANTENIMIENTO_PENDIENTE. */
export function darDeBaja(u: Unidad, motivo: string, ahora: Date): Unidad {
  if (u.estado !== 'DISPONIBLE' && u.estado !== 'MANTENIMIENTO_PENDIENTE') {
    throw new ErrorDeDominio('CONFLICTO_ESTADO', `La unidad está ${u.estado} y no se puede dar de baja`, { estadoActual: u.estado });
  }
  return { ...u, estado: 'INACTIVA', baja: { motivo, dadaEn: ahora.toISOString() } };
}

function validarCapacidad(tipo: TipoUnidad, capacidad: number | undefined) {
  if (tipo === 'REMOLQUE' && capacidad === undefined) invalido('capacidadToneladas', 'es obligatoria en remolques');
  if (tipo === 'TRACTO' && capacidad !== undefined) invalido('capacidadToneladas', 'solo en remolques');
}

/** Un SOAT y una INSPECCION_TECNICA. */
export function validarDocumentos(documentos: Documento[]) {
  for (const tipo of ['SOAT', 'INSPECCION_TECNICA'] as const) {
    if (documentos.filter((d) => d.tipo === tipo).length !== 1) invalido('documentos', `debe traer un ${tipo}`);
  }
}

function invalido(campo: string, mensaje: string): never {
  throw new ErrorDeDominio('VALIDACION', `${campo}: ${mensaje}`, { campo });
}
