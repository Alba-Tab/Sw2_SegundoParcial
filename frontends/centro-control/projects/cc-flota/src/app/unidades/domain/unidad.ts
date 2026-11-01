import { etiqueta, mensajeCampo, numero, vigencia, type ErroresCampo } from 'ui-comun/dominio';
import type { TipoMantenimiento, UnidadEdicionInput, UnidadesQuery, UnidadNuevaInput, UnidadQuery } from '../../graphql/generado';

/** Tipos y reglas de presentación de unidades y mantenimientos (spec 010). Sin Angular ni Apollo. */
export type Unidad = NonNullable<UnidadesQuery['unidades']>[number];
export type DetalleUnidad = NonNullable<UnidadQuery['unidad']>;
export type Mantenimiento = NonNullable<UnidadQuery['mantenimientos']>['items'][number];
export type NuevaUnidad = Omit<UnidadNuevaInput, 'claveIdempotencia'>;
export type EdicionUnidad = Omit<UnidadEdicionInput, 'claveIdempotencia' | 'unidadId'>;
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

/** Programar un mantenimiento, editar y dar de baja: solo con la unidad disponible o con el aviso pendiente (spec 010). */
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

/** Contrato de Flota (`Placa`): 3 o 4 números y 3 letras. */
export const PLACA = /^[0-9]{3,4}[A-Z]{3}$/;

/** Lo que define los atributos de una unidad (D76): el tracto o el tipo de remolque. */
export type ClaseUnidad = 'TRACTO' | 'FURGON' | 'PLATAFORMA' | 'CISTERNA';
export interface ReglaAtributo {
  campo: string;
  etiqueta: string;
  min: number;
  max?: number;
  entero?: boolean;
  opcional?: boolean;
}

/** D76: atributos de cada clase con sus rangos; Flota rechaza los de otra clase. */
export const ATRIBUTOS: Record<ClaseUnidad, readonly ReglaAtributo[]> = {
  TRACTO: [
    { campo: 'capacidadTanqueLitros', etiqueta: 'Tanque (litros)', min: 100, max: 1500 },
    { campo: 'potenciaHp', etiqueta: 'Potencia (HP)', min: 1, opcional: true },
  ],
  FURGON: [{ campo: 'volumenM3', etiqueta: 'Volumen (m³)', min: 10, max: 120 }],
  PLATAFORMA: [{ campo: 'largoMetros', etiqueta: 'Largo (metros)', min: 6, max: 15 }],
  CISTERNA: [
    { campo: 'compartimentos', etiqueta: 'Compartimentos', min: 1, max: 6, entero: true },
    { campo: 'capacidadLitros', etiqueta: 'Capacidad (litros)', min: 5000, max: 45000 },
  ],
};

/** Todos los campos de atributos, sin repetir: el formulario tiene uno por campo y activa los de la clase. */
export const CAMPOS_ATRIBUTO = Object.values(ATRIBUTOS).flatMap((reglas) => reglas.map((r) => r.campo));

export const claseUnidad = (tipoUnidad: string, tipoRemolque?: string | null): ClaseUnidad | null =>
  tipoUnidad === 'TRACTO' ? 'TRACTO' : ((tipoRemolque as ClaseUnidad | null | undefined) ?? null);

/** Solo los atributos de la clase y con valor (un opcional vacío no viaja). */
export function atributosDe(clase: ClaseUnidad, valores: Record<string, number | null | undefined>): Record<string, number> {
  const atributos: Record<string, number> = {};
  for (const { campo } of ATRIBUTOS[clase]) {
    const v = valores[campo];
    if (v !== null && v !== undefined) atributos[campo] = v;
  }
  return atributos;
}

/** El SOAT y la inspección técnica, como los pide Flota (un documento de cada tipo). */
export const documentosDe = (soat: string, inspeccion: string) => [
  { tipo: 'SOAT', venceEl: soat },
  { tipo: 'INSPECCION_TECNICA', venceEl: inspeccion },
];

export const venceDocumento = (documentos: readonly { tipo: string; venceEl: string }[], tipo: string): string =>
  documentos.find((d) => d.tipo === tipo)?.venceEl ?? '';

/** El texto de error de los campos de unidad: la placa y los enteros tienen el suyo; lo demás, el de siempre. */
export function mensajeUnidad(errores: ErroresCampo): string {
  if (errores?.['placa']) return 'Escribe 3 o 4 números y 3 letras, por ejemplo 4521KTR.';
  if (errores?.['entero']) return 'Escribe un número entero.';
  if (errores?.['mayorQueCero']) return 'Debe ser mayor que 0.';
  return mensajeCampo(errores);
}

/** Lo que se escribe en los campos comunes del alta y la edición: capacidad, documentos y atributos. */
export interface CamposEscritos {
  capacidadToneladas: number | null;
  soat: string;
  inspeccion: string;
  atributos: Record<string, number | null>;
}

/** La edición que va a Flota: la capacidad solo en remolques, un documento de cada tipo y los atributos de la clase. */
export function edicionDesde(clase: ClaseUnidad, c: CamposEscritos): EdicionUnidad {
  return {
    ...(clase === 'TRACTO' ? {} : { capacidadToneladas: c.capacidadToneladas }),
    documentos: documentosDe(c.soat, c.inspeccion),
    atributos: atributosDe(clase, c.atributos),
  };
}

/** El alta que va a Flota: el tracto con su odómetro; el remolque con su tipo y su capacidad. Placa en mayúsculas. */
export function nuevaUnidadDesde(
  v: {
    tipoUnidad: 'TRACTO' | 'REMOLQUE';
    tipoRemolque: string;
    placa: string;
    kilometraje: number | null;
    kmDesdeUltimoMantenimiento: number | null;
  },
  c: CamposEscritos,
): NuevaUnidad {
  const tracto = v.tipoUnidad === 'TRACTO';
  const clase = tracto ? 'TRACTO' : (v.tipoRemolque as ClaseUnidad);
  return {
    tipoUnidad: v.tipoUnidad,
    placa: v.placa.trim().toUpperCase(),
    ...(tracto ? { kilometraje: v.kilometraje ?? 0 } : { tipoRemolque: v.tipoRemolque }),
    kmDesdeUltimoMantenimiento: v.kmDesdeUltimoMantenimiento ?? 0,
    ...edicionDesde(clase, c),
  };
}
