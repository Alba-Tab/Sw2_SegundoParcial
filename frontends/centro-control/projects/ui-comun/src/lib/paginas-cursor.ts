import { computed, signal } from '@angular/core';

/** Una página con cursor del Gateway (`ClientePagina`, E5-1): `siguienteCursor` null es la última. */
export interface PaginaCursor<T> {
  items: readonly T[];
  siguienteCursor?: string | null;
}

/**
 * «Cargar más» sobre una lista paginada por cursor (E5-1). La primera página es la del `watch` (con su sondeo y sus
 * datos repuestos, FB-1); las siguientes se piden una vez, al pulsar, y se agregan al final. Viajes ordena por id
 * ascendente, así que una página nueva nunca repite filas de las anteriores.
 */
export class PaginasCursor<T> {
  private readonly extras = signal<PaginaCursor<T>[]>([]);
  readonly cargandoMas = signal(false);

  constructor(
    private readonly primera: () => PaginaCursor<T> | null | undefined,
    private readonly pedir: (despuesDe: string) => Promise<PaginaCursor<T> | null | undefined>,
  ) {}

  readonly items = computed(() => [...(this.primera()?.items ?? []), ...this.extras().flatMap((p) => p.items)]);

  /** El cursor de la última página leída; null si ya no hay más. */
  readonly siguienteCursor = computed(() => {
    const extras = this.extras();
    return (extras.length ? extras.at(-1)?.siguienteCursor : this.primera()?.siguienteCursor) ?? null;
  });

  /** Pide la página siguiente; si falla, lanza y no cambia lo mostrado. */
  async cargarMas(): Promise<void> {
    const cursor = this.siguienteCursor();
    if (!cursor || this.cargandoMas()) return;
    this.cargandoMas.set(true);
    try {
      const pagina = await this.pedir(cursor);
      this.extras.update((e) => [...e, { items: pagina?.items ?? [], siguienteCursor: pagina?.siguienteCursor ?? null }]);
    } finally {
      this.cargandoMas.set(false);
    }
  }
}
