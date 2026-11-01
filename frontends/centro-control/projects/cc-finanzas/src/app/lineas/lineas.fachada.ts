import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { cargandoDe, completo, conservarUltimoBueno, Intentos, PaginasCursor } from 'ui-comun';
import type { LineasCreditoQuery } from '../graphql/generado';
import { LineasRepositorio } from './data/lineas.repositorio';
import { conLinea, type Linea } from './domain/linea';

/** La línea de crédito de cada cliente sale de Finanzas: si cae, se conserva la última leída (FB-1). */
const LINEA_POR_CLIENTE = { 'clientes.items': { clave: 'clienteId', campos: ['lineaCredito'] } };

/**
 * Fachada de las líneas de crédito: la primera página de clientes cada 60 s, las siguientes con «Cargar más» (E5-1),
 * y su gestión (G6, spec 012).
 */
@Injectable()
export class LineasFachada {
  private readonly repo = inject(LineasRepositorio);
  /** Una clave por intento: reintentar tras un corte con los mismos datos no aplica dos veces el cambio. */
  private readonly intentos = new Intentos();
  private readonly consulta = this.repo.observar(60_000);
  private readonly datos = toSignal(this.consulta.valueChanges.pipe(conservarUltimoBueno(undefined, LINEA_POR_CLIENTE)));
  readonly paginas = new PaginasCursor(
    () => completo<LineasCreditoQuery>(this.datos())?.clientes,
    async (despuesDe) => {
      const r = await firstValueFrom(this.repo.pagina(despuesDe));
      return { pagina: completo<LineasCreditoQuery>(r)?.clientes, error: r.error };
    },
    (c) => c.clienteId,
  );
  /**
   * Lo que devolvieron las mutaciones, por cliente. `recargar` solo relee la primera página: una fila de «Cargar más»
   * gestionada se muestra con la respuesta de la mutación (las de la primera página siguen con el sondeo).
   */
  private readonly gestionadas = signal<ReadonlyMap<string, Partial<Linea>>>(new Map());
  private readonly enPrimera = computed(() => new Set(completo<LineasCreditoQuery>(this.datos())?.clientes?.items.map((c) => c.clienteId)));
  readonly lineas = computed(() => {
    const g = this.gestionadas();
    return conLinea(this.paginas.items()).map((c) =>
      this.enPrimera().has(c.clienteId) || !g.has(c.clienteId) ? c : { ...c, lineaCredito: { ...c.lineaCredito, ...g.get(c.clienteId) } },
    );
  });
  readonly error = computed(() => this.datos()?.error);
  readonly datosAl = computed(() => this.datos()?.datosAl);
  readonly cargando = computed(() => cargandoDe(this.datos()));
  /** Clientes cuya línea no se pudo leer: no salen en la lista, y se dice (D-1). */
  readonly incompletas = computed(() => {
    // De todas las páginas cargadas (E2-2). Las que se repusieron con la última línea leída (FB-1) sí salen: no se cuentan.
    const ids = this.paginas.idsConError('clientes.items', 'lineaCredito', this.datos()?.error);
    return this.paginas.items().filter((c) => ids.has(c.clienteId) && !c.lineaCredito).length;
  });

  async ajustar(clienteId: string, limite: string, motivo: string) {
    const r = await this.intentos.enviar(`ajustarLineaCredito:${clienteId}`, { limite, motivo }, (clave) =>
      this.repo.ajustar(clienteId, limite, motivo, clave),
    );
    this.gestionada(clienteId, r.data?.ajustarLineaCredito);
    return r;
  }

  async cambiarEstado(clienteId: string, suspendida: boolean, motivo: string) {
    const r = await this.intentos.enviar(`cambiarEstadoLineaCredito:${clienteId}`, { suspendida, motivo }, (clave) =>
      this.repo.cambiarEstado(clienteId, suspendida, motivo, clave),
    );
    this.gestionada(clienteId, r.data?.cambiarEstadoLineaCredito);
    return r;
  }

  private gestionada(clienteId: string, linea: Partial<Linea> | null | undefined): void {
    if (linea) this.gestionadas.update((g) => new Map(g).set(clienteId, linea));
  }

  /** `refetch` del mismo `watch`: al resolver, la primera página ya trae el cambio (V4-1). */
  recargar(): Promise<unknown> {
    return this.consulta.refetch();
  }
}
