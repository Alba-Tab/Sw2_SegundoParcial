import { etiqueta, vigencia } from 'ui-comun/dominio';
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

/** Contrato de Flota (MantenimientoNuevo.checklist): de 1 a 30 ítems de hasta 120 caracteres. */
export const checklistValido = (texto: string): boolean => {
  const lineas = lineasChecklist(texto);
  return lineas.length >= 1 && lineas.length <= 30 && lineas.every((l) => l.length <= 120);
};

/** Spec 010: un mantenimiento se cierra solo con todos los ítems hechos (`ok = true`). */
export const checklistCompleto = (items: readonly ItemCierre[]): boolean => items.length > 0 && items.every((i) => i.ok);

/** Al cerrar, cada ítem empieza marcado como hecho. */
export const cierreInicial = (m: Mantenimiento): ItemCierre[] => m.checklist.map((i) => ({ item: i.item, ok: true }));

/** Se puede programar un mantenimiento solo con la unidad disponible o con el aviso pendiente. */
export const puedeProgramar = (estado: string): boolean => estado === 'DISPONIBLE' || estado === 'MANTENIMIENTO_PENDIENTE';

/** Lo que encuentra la búsqueda de la lista: placa y tipo con su texto en pantalla ("tracto", "furgón"). */
export const textoUnidad = (u: Unidad): string =>
  [u.placa, etiqueta('TipoUnidad', u.tipoUnidad).texto, u.tipoRemolque ? etiqueta('TipoRemolque', u.tipoRemolque).texto : ''].join(' ');

/** Cuántos documentos de la unidad están vencidos o por vencer (G2): la ficha avisa y la lista los marca. */
export const documentosEnAviso = (documentos: readonly { venceEl: string }[], hoy?: string): number =>
  documentos.filter((d) => vigencia(d.venceEl, hoy) !== 'VIGENTE').length;
