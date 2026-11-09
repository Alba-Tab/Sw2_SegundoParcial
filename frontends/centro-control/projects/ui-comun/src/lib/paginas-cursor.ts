import { computed, signal } from '@angular/core';
import { filasConError } from './errores';

/** Una página con cursor del Gateway (`ClientePagina`, `ChoferPagina`…, E5-1): `siguienteCursor` null es la última. */
export interface PaginaCursor<T> {
  items: readonly T[];
  siguienteCursor?: string | null;
}

/**
 * Lo que trae una página pedida con `errorPolicy: 'all'`: la página (null si su servicio falló) y el error de la
 * respuesta, que puede ser solo de algunas filas (por ejemplo, la línea de crédito de un cliente).
 */
export interface ResultadoPagina<T> {
  pagina?: PaginaCursor<T> | null;
  error?: unknown;
}

interface Extra<T> {
  items: readonly T[];
  siguienteCursor: string | null;
  error?: unknown;
}

/**
 * «Cargar más» sobre una lista paginada por cursor (E5-1, E2-6). La primera página es la del `watch` (con su sondeo y
 * sus datos repuestos, FB-1); las siguientes se piden una vez, al pulsar, y se agregan al final.
 *
 * El sondeo puede correr el borde de la primera página (en una lista del más nuevo al más viejo, cada alta empuja una
 * fila hacia la segunda página). Por eso: las filas se deduplican por id, y si cambia el cursor con que termina la
 * primera página, las páginas extra se descartan (seguir con ellas dejaría un hueco) y «Cargar más» vuelve a empezar.
 */
export class PaginasCursor<T> {
  private readonly extras = signal<{ borde: string | null; paginas: readonly Extra<T>[] }>({ borde: null, paginas: [] });
  readonly cargandoMas = signal(false);
  /** E2-2: el error de la última «Cargar más» que falló; el cursor queda igual para «Reintentar». */
  readonly error = signal<unknown>(undefined);

  constructor(
    private readonly primera: () => PaginaCursor<T> | null | undefined,
    private readonly pedir: (despuesDe: string) => Promise<ResultadoPagina<T>>,
    private readonly id: (fila: T) => string,
  ) {}

  private readonly borde = computed(() => this.primera()?.siguienteCursor ?? null);
  /** Las páginas extra que siguen valiendo: las pedidas a partir del borde actual de la primera. */
  private readonly vigentes = computed(() => {
    const e = this.extras();
    return e.borde === this.borde() ? e.paginas : [];
  });

  readonly items = computed(() => {
    const vistos = new Set<string>();
    return [this.primera()?.items ?? [], ...this.vigentes().map((p) => p.items)].flat().filter((fila) => {
      const clave = this.id(fila);
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
  });

  /** El cursor de la última página leída; null si ya no hay más. */
  readonly siguienteCursor = computed(() => {
    const paginas = this.vigentes();
    return paginas.length ? paginas[paginas.length - 1].siguienteCursor : this.borde();
  });

  /**
   * Los ids de las filas con error en `campo`, en la primera página (con `errorPrimera`) y en las extra (E2-2). `ruta` es
   * la de la lista en la respuesta, por ejemplo "clientes.items".
   */
  idsConError(ruta: string, campo: string, errorPrimera: unknown): Set<string> {
    const ids = new Set<string>();
    const paginas = [{ items: this.primera()?.items ?? [], error: errorPrimera }, ...this.vigentes()];
    for (const p of paginas) for (const i of filasConError(p.error, ruta, campo)) if (p.items[i]) ids.add(this.id(p.items[i]));
    return ids;
  }

  /** Pide la página siguiente. Si falla, no cambia lo mostrado: deja el error en `error` y el mismo cursor. */
  async cargarMas(): Promise<void> {
    const cursor = this.siguienteCursor();
    if (!cursor || this.cargandoMas()) return;
    const [borde, previas] = [this.borde(), this.vigentes()];
    this.cargandoMas.set(true);
    this.error.set(undefined);
    try {
      const r = await this.pedir(cursor);
      if (!r.pagina) throw r.error ?? new Error('La página siguiente no llegó');
      const extra = { items: r.pagina.items, siguienteCursor: r.pagina.siguienteCursor ?? null, error: r.error };
      this.extras.set({ borde, paginas: [...previas, extra] });
    } catch (e) {
      this.error.set(e);
    } finally {
      this.cargandoMas.set(false);
    }
  }
}
