import { etiqueta, numero, vigencia } from 'ui-comun/dominio';
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

/** Regla C, D07 (spec 010): Flota pide mantenimiento a los 10.000 km desde el último o con el SOAT o la inspección
 * técnica a 15 días o menos de vencer. */
export const KM_MANTENIMIENTO = 10_000;
export const DIAS_AVISO_MANTENIMIENTO = 15;

/** Solo para marcar «cerca del mantenimiento» en la lista y la ficha: desde los 9.000 km. */
export const AVISO_KM = 9000;

/** Los documentos que cuenta la regla C, como se nombran dentro de una frase. */
const DOCUMENTO_EN_FRASE: Record<string, string> = { SOAT: 'el SOAT', INSPECCION_TECNICA: 'la inspección técnica' };

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

/**
 * JV-1: el orden con que abre la lista, lo que no puede salir primero: mantenimiento pendiente o un documento vencido,
 * en el taller, cerca del mantenimiento o con un documento por vencer, el resto y al final las inactivas. Dentro de cada
 * grupo, por placa.
 */
export function urgenciaUnidad(u: Pick<Unidad, 'estado' | 'placa' | 'kmDesdeUltimoMantenimiento' | 'documentos'>, hoy?: string): string {
  const vigencias = u.documentos.map((d) => vigencia(d.venceEl, hoy));
  let grupo = 3;
  if (u.estado === 'MANTENIMIENTO_PENDIENTE' || vigencias.includes('VENCIDO')) grupo = 0;
  else if (u.estado === 'EN_MANTENIMIENTO') grupo = 1;
  else if (u.estado === 'INACTIVA') grupo = 4;
  else if (u.kmDesdeUltimoMantenimiento >= AVISO_KM || vigencias.includes('POR_VENCER')) grupo = 2;
  return `${grupo}-${u.placa}`;
}

/**
 * NG-4: por qué la unidad no puede salir y quién lo resuelve, con la misma regla C que aplica Flota (D07): km desde el
 * último mantenimiento ≥ 10.000 y el SOAT o la inspección técnica que vencen en 15 días o menos. Nombra todas las causas
 * que se cumplen; sin ninguna, una frase genérica. null si la unidad no está detenida por mantenimiento.
 */
export function motivoBloqueo(
  u: Pick<DetalleUnidad, 'estado' | 'kmDesdeUltimoMantenimiento' | 'documentos'>,
  esJefeFlota: boolean,
  hoy?: string,
): string | null {
  if (u.estado === 'EN_MANTENIMIENTO') {
    return `Está en el taller: vuelve a estar disponible cuando ${esJefeFlota ? 'cierres' : 'el jefe de flota cierre'} el mantenimiento.`;
  }
  if (u.estado !== 'MANTENIMIENTO_PENDIENTE') return null;
  const razones: string[] = [];
  if (u.kmDesdeUltimoMantenimiento >= KM_MANTENIMIENTO)
    razones.push(`lleva ${numero(u.kmDesdeUltimoMantenimiento)} km desde el último mantenimiento`);
  for (const d of u.documentos) {
    const v = vigencia(d.venceEl, hoy, DIAS_AVISO_MANTENIMIENTO);
    if (!(d.tipo in DOCUMENTO_EN_FRASE) || v === 'VIGENTE') continue;
    const [a, m, dia] = d.venceEl.split('-');
    razones.push(`${DOCUMENTO_EN_FRASE[d.tipo]} ${v === 'VENCIDO' ? 'venció' : 'vence'} el ${dia}/${m}/${a}`);
  }
  const porque = razones.length ? razones.join('; ') : 'tiene un mantenimiento pendiente';
  const quien = esJefeFlota ? 'Prográmalo con «Programar mantenimiento».' : 'Lo programa el jefe de flota.';
  return `No puede salir: ${porque}. ${quien}`;
}
