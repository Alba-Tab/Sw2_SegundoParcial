import type { TipoMantenimiento, UnidadesQuery, UnidadQuery } from '../../graphql/generado';

/** Tipos y reglas de presentación de unidades y mantenimientos (spec 010). Sin Angular ni Apollo. */
export type Unidad = NonNullable<UnidadesQuery['unidades']>[number];
export type DetalleUnidad = NonNullable<UnidadQuery['unidad']>;
export type Mantenimiento = NonNullable<UnidadQuery['mantenimientos']>[number];
export interface ItemCierre {
  item: string;
  ok: boolean;
}
export interface NuevoMantenimiento {
  tipo: TipoMantenimiento;
  fechaProgramada: string;
  taller: string;
  descripcion: string;
  /** Una línea por ítem. */
  checklist: string;
}

/** D11: el aviso de mantenimiento es a los 10.000 km; aquí se marca desde los 9.000. */
export const AVISO_KM = 9000;

export const CHECKLIST_POR_DEFECTO = 'Aceite y filtros\nFrenos\nNeumáticos\nLuces';

/** El texto del checklist (una línea por ítem) como lista, sin líneas vacías. */
export const lineasChecklist = (texto: string): string[] =>
  texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** Al cerrar, cada ítem empieza marcado como hecho. */
export const cierreInicial = (m: Mantenimiento): ItemCierre[] => m.checklist.map((i) => ({ item: i.item, ok: true }));

/** Se puede programar un mantenimiento solo con la unidad disponible o con el aviso pendiente. */
export const puedeProgramar = (estado: string): boolean => estado === 'DISPONIBLE' || estado === 'MANTENIMIENTO_PENDIENTE';
