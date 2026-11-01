import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { cargandoDe, completo } from 'ui-comun';
import type { MantenimientosQuery } from '../graphql/generado';
import { PaginasPorCursor } from '../paginas';
import { MantenimientosRepositorio } from './data/mantenimientos.repositorio';

/** Fachada de la lista de mantenimientos: la primera página cada 30 s y las demás con «Cargar más». Por componente. */
@Injectable()
export class MantenimientosFachada {
  private readonly repo = inject(MantenimientosRepositorio);
  private readonly datos = toSignal(this.repo.observar(30_000));
  private readonly paginas = new PaginasPorCursor(
    computed(() => completo<MantenimientosQuery>(this.datos())?.mantenimientos),
    (despuesDe) => this.repo.pagina(despuesDe),
    (m) => m.mantenimientoId,
  );
  readonly mantenimientos = this.paginas.items;
  readonly siguienteCursor = this.paginas.siguienteCursor;
  readonly cargandoMas = this.paginas.cargandoMas;
  readonly cargarMas = () => this.paginas.cargarMas();
  readonly error = computed(() => this.datos()?.error);
  readonly datosAl = computed(() => this.datos()?.datosAl);
  readonly cargando = computed(() => cargandoDe(this.datos()));
}
