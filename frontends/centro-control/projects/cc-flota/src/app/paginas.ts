import { computed, signal, type Signal } from '@angular/core';

export interface Pagina<T> {
  items: readonly T[];
  siguienteCursor?: string | null;
}

/**
 * Una lista paginada por cursor con «Cargar más» (E5-1): la primera página la trae la consulta que se sondea; las
 * siguientes se piden una vez cada una y se agregan al final, sin repetir filas por id (un sondeo puede correr el borde).
 */
export class PaginasPorCursor<T> {
  private readonly mas = signal<readonly T[]>([]);
  /** El cursor de la última página extra; `undefined` mientras no se cargó ninguna. */
  private readonly cursorMas = signal<string | null | undefined>(undefined);
  readonly cargandoMas = signal(false);

  readonly items = computed(() => {
    const base = this.primera()?.items ?? [];
    const vistos = new Set(base.map(this.id));
    return [...base, ...this.mas().filter((x) => !vistos.has(this.id(x)))];
  });
  readonly siguienteCursor = computed(() => {
    const extra = this.cursorMas();
    return extra !== undefined ? extra : (this.primera()?.siguienteCursor ?? null);
  });

  constructor(
    private readonly primera: Signal<Pagina<T> | null | undefined>,
    private readonly pedir: (despuesDe: string) => Promise<Pagina<T> | null | undefined>,
    private readonly id: (fila: T) => string,
  ) {}

  /** Pide la página siguiente; un error lo muestra quien llama y la lista queda como estaba. */
  async cargarMas(): Promise<void> {
    const cursor = this.siguienteCursor();
    if (!cursor || this.cargandoMas()) return;
    this.cargandoMas.set(true);
    try {
      const pagina = await this.pedir(cursor);
      this.mas.update((filas) => [...filas, ...(pagina?.items ?? [])]);
      this.cursorMas.set(pagina?.siguienteCursor ?? null);
    } finally {
      this.cargandoMas.set(false);
    }
  }
}
