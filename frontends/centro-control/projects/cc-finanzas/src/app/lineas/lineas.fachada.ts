import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { cargandoDe, completo, PaginasCursor } from 'ui-comun';
import type { LineasCreditoQuery } from '../graphql/generado';
import { LineasRepositorio } from './data/lineas.repositorio';
import { conLinea } from './domain/linea';

/** Fachada de las líneas de crédito: la primera página de clientes cada 60 s y las siguientes con «Cargar más» (E5-1). */
@Injectable()
export class LineasFachada {
  private readonly repo = inject(LineasRepositorio);
  private readonly datos = toSignal(this.repo.observar(60_000));
  readonly paginas = new PaginasCursor(
    () => completo<LineasCreditoQuery>(this.datos())?.clientes,
    async (despuesDe) => {
      const r = await firstValueFrom(this.repo.pagina(despuesDe));
      return { pagina: completo<LineasCreditoQuery>(r)?.clientes, error: r.error };
    },
    (c) => c.clienteId,
  );
  readonly lineas = computed(() => conLinea(this.paginas.items()));
  readonly error = computed(() => this.datos()?.error);
  readonly datosAl = computed(() => this.datos()?.datosAl);
  readonly cargando = computed(() => cargandoDe(this.datos()));
  /** Clientes cuya línea no se pudo leer: no salen en la lista, y se dice (D-1). */
  readonly incompletas = computed(() => {
    // De todas las páginas cargadas (E2-2). Las que se repusieron con la última línea leída (FB-1) sí salen: no se cuentan.
    const ids = this.paginas.idsConError('clientes.items', 'lineaCredito', this.datos()?.error);
    return this.paginas.items().filter((c) => ids.has(c.clienteId) && !c.lineaCredito).length;
  });
}
