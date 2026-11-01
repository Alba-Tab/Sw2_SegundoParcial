import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { completo } from 'ui-comun';
import type { MantenimientosQuery } from '../graphql/generado';
import { MantenimientosRepositorio } from './data/mantenimientos.repositorio';

/** Fachada de la lista de mantenimientos, cada 30 s. Se provee por componente. */
@Injectable()
export class MantenimientosFachada {
  private readonly datos = toSignal(inject(MantenimientosRepositorio).observar(30_000));
  readonly mantenimientos = computed(() => completo<MantenimientosQuery>(this.datos())?.mantenimientos ?? []);
  readonly error = computed(() => this.datos()?.error);
}
