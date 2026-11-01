import { ETIQUETAS, type GrupoEtiqueta } from './etiquetas';

/**
 * Lo puro de las listas (U1): buscar, filtrar por estado, ordenar y paginar en el navegador, y leer y escribir ese
 * filtro en la URL para que volver desde el detalle lo conserve. Sin Angular: lo usa `ControlLista` en ui-comun.
 */
export type Direccion = 'asc' | 'desc' | '';

export interface FiltroLista {
  q: string;
  estado: string | null;
  orden: string | null;
  dir: Direccion;
  /** Desde 0, como MatPaginator; en la URL va desde 1. */
  pagina: number;
  tamano: number;
}

export const TAMANOS_PAGINA = [10, 25, 50, 100];

/** Lo más que devuelve el Gateway en `clientes`, `choferes` y `mantenimientos` (LIMITE_MAXIMO, sin cursor; D-2, D-3). */
export const LIMITE_GATEWAY = 100;
export const TAMANO_POR_DEFECTO = 25;

/** Minúsculas y sin tildes: "Peña" encuentra "pena" y "Logística" encuentra "logistica". */
export const normalizar = (texto: string): string => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Filas cuyo texto contiene todas las palabras buscadas y cuyo estado es el elegido. */
export function filtrar<T>(
  filas: readonly T[],
  q: string,
  textoDe: (f: T) => string,
  estado: string | null = null,
  estadoDe?: (f: T) => string | null | undefined,
): T[] {
  const palabras = normalizar(q).split(/\s+/).filter(Boolean);
  return filas.filter((f) => {
    if (estado && estadoDe && estadoDe(f) !== estado) return false;
    if (!palabras.length) return true;
    const texto = normalizar(textoDe(f));
    return palabras.every((p) => texto.includes(p));
  });
}

type Valor = string | number | bigint | null | undefined;

/** Orden estable; los vacíos van al final en las dos direcciones. Texto en orden alfabético del español. */
export function ordenar<T>(filas: readonly T[], valorDe: ((f: T) => Valor) | undefined, dir: Direccion): T[] {
  if (!valorDe || !dir) return [...filas];
  const signo = dir === 'asc' ? 1 : -1;
  return filas
    .map((f, i) => ({ f, i, v: valorDe(f) }))
    .sort((a, b) => {
      const vacioA = a.v === null || a.v === undefined || a.v === '';
      const vacioB = b.v === null || b.v === undefined || b.v === '';
      if (vacioA || vacioB) return vacioA === vacioB ? a.i - b.i : vacioA ? 1 : -1;
      const c =
        typeof a.v === 'string' && typeof b.v === 'string'
          ? a.v.localeCompare(b.v, 'es', { numeric: true, sensitivity: 'base' })
          : a.v! < b.v!
            ? -1
            : a.v! > b.v!
              ? 1
              : 0;
      return c * signo || a.i - b.i;
    })
    .map((x) => x.f);
}

/** La página pedida; si quedó fuera de rango (el filtro achicó la lista), la última que exista. */
export function paginar<T>(filas: readonly T[], pagina: number, tamano: number): T[] {
  const ultima = Math.max(0, Math.ceil(filas.length / tamano) - 1);
  const p = Math.min(Math.max(0, pagina), ultima);
  return filas.slice(p * tamano, (p + 1) * tamano);
}

/** Los valores de un grupo de ETIQUETAS para el filtro por estado, con su texto (o solo los indicados, en ese orden). */
export function opcionesEstado(grupo: GrupoEtiqueta, valores?: readonly string[]): { valor: string; texto: string }[] {
  const mapa = ETIQUETAS[grupo] as Record<string, { texto: string }>;
  return (valores ?? Object.keys(mapa)).map((valor) => ({ valor, texto: mapa[valor]?.texto ?? valor }));
}

const entero = (v: string | null | undefined, porDefecto: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : porDefecto;
};

/** El filtro desde los parámetros de la URL (`prefijo` separa dos listas de la misma página). */
export function leerFiltro(param: (nombre: string) => string | null, prefijo = ''): FiltroLista {
  const dir = param(`${prefijo}dir`);
  const tamano = entero(param(`${prefijo}tamano`), TAMANO_POR_DEFECTO);
  return {
    q: param(`${prefijo}q`) ?? '',
    estado: param(`${prefijo}estado`) || null,
    orden: param(`${prefijo}orden`) || null,
    dir: dir === 'asc' || dir === 'desc' ? dir : '',
    pagina: entero(param(`${prefijo}pagina`), 1) - 1,
    tamano: TAMANOS_PAGINA.includes(tamano) ? tamano : TAMANO_POR_DEFECTO,
  };
}

/** Los parámetros de la URL para un cambio del filtro; `null` quita el parámetro (URL limpia con los valores por defecto). */
export function aParametros(cambio: Partial<FiltroLista>, prefijo = ''): Record<string, string | null> {
  const p: Record<string, string | null> = {};
  if ('q' in cambio) p[`${prefijo}q`] = cambio.q?.trim() || null;
  if ('estado' in cambio) p[`${prefijo}estado`] = cambio.estado || null;
  if ('orden' in cambio) p[`${prefijo}orden`] = cambio.orden || null;
  if ('dir' in cambio) p[`${prefijo}dir`] = cambio.dir || null;
  if ('pagina' in cambio) p[`${prefijo}pagina`] = cambio.pagina ? String(cambio.pagina + 1) : null;
  if ('tamano' in cambio) p[`${prefijo}tamano`] = cambio.tamano && cambio.tamano !== TAMANO_POR_DEFECTO ? String(cambio.tamano) : null;
  return p;
}
