/** Tracto o remolque (spec 010). `atributos` cambia según el tipo; Mongo los guarda tal cual (requisito 4). */
export type TipoUnidad = 'TRACTO' | 'REMOLQUE';
export type TipoRemolque = 'FURGON' | 'PLATAFORMA' | 'CISTERNA';
export type EstadoUnidad = 'DISPONIBLE' | 'RESERVADA' | 'EN_VIAJE' | 'MANTENIMIENTO_PENDIENTE' | 'EN_MANTENIMIENTO' | 'INACTIVA';
export type TipoCarga = 'GRANOS' | 'INSUMOS' | 'INSUMOS_LIQUIDOS' | 'CONTENEDOR';

export interface Documento {
  tipo: 'SOAT' | 'INSPECCION_TECNICA';
  /** Fecha `YYYY-MM-DD`. */
  venceEl: string;
}

export interface Unidad {
  unidadId: string;
  tipoUnidad: TipoUnidad;
  placa: string;
  tipoRemolque?: TipoRemolque;
  capacidadToneladas?: number;
  estado: EstadoUnidad;
  kilometraje?: number;
  kmDesdeUltimoMantenimiento: number;
  documentos: Documento[];
  atributos: Record<string, unknown>;
}

/** Spec 003: qué remolque lleva cada carga. */
export const REMOLQUES_POR_CARGA: Record<TipoCarga, TipoRemolque[]> = {
  GRANOS: ['FURGON'],
  INSUMOS: ['FURGON', 'PLATAFORMA'],
  INSUMOS_LIQUIDOS: ['CISTERNA'],
  CONTENEDOR: ['PLATAFORMA'],
};

/** SOAT e inspección técnica vigentes el día del viaje (comparación de fechas ISO como texto). */
export function documentosVigentes(u: Unidad, fecha: string): boolean {
  const vence = (tipo: Documento['tipo']) => u.documentos.find((d) => d.tipo === tipo)?.venceEl;
  return [vence('SOAT'), vence('INSPECCION_TECNICA')].every((v) => v !== undefined && v >= fecha);
}

/** Reservable en la saga: DISPONIBLE y con documentos vigentes (spec 010). */
export function reservable(u: Unidad, fecha: string): boolean {
  return u.estado === 'DISPONIBLE' && documentosVigentes(u, fecha);
}

export function remolqueCompatible(u: Unidad, carga: TipoCarga, toneladas: number): boolean {
  return (
    u.tipoUnidad === 'REMOLQUE' &&
    u.tipoRemolque !== undefined &&
    REMOLQUES_POR_CARGA[carga].includes(u.tipoRemolque) &&
    (u.capacidadToneladas ?? 0) >= toneladas
  );
}

/** D11: primero la de más km desde su último mantenimiento; desempate por placa. */
export function porPrioridad(a: Unidad, b: Unidad): number {
  return b.kmDesdeUltimoMantenimiento - a.kmDesdeUltimoMantenimiento || a.placa.localeCompare(b.placa);
}
