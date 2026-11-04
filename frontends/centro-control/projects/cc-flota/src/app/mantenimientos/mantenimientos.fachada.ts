import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { cargandoDe, completo, PaginasCursor } from 'ui-comun';
import type { MantenimientosQuery } from '../graphql/generado';
import { MantenimientosRepositorio } from './data/mantenimientos.repositorio';

/** Fachada de la lista de mantenimientos: la primera página cada 30 s y las demás con «Cargar más». Por componente. */
@Injectable()
export class MantenimientosFachada {
  private readonly repo = inject(MantenimientosRepositorio);
  private readonly datos = toSignal(this.repo.observar(30_000));
  readonly paginas = new PaginasCursor(
    () => completo<MantenimientosQuery>(this.datos())?.mantenimientos,
    async (despuesDe) => {
      const r = await firstValueFrom(this.repo.pagina(despuesDe));
      return { pagina: completo<MantenimientosQuery>(r)?.mantenimientos, error: r.error };
    },
    (m) => m.mantenimientoId,
  );
  readonly mantenimientos = this.paginas.items;
  readonly error = computed(() => this.datos()?.error);
  readonly datosAl = computed(() => this.datos()?.datosAl);
  readonly cargando = computed(() => cargandoDe(this.datos()));
}
