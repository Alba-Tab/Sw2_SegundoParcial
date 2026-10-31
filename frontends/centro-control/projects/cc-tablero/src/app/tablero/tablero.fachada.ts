import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { servicioCaido } from 'ui-comun';
import type { Periodo } from '../graphql/generado';
import { TableroRepositorio } from './data/tablero.repositorio';

/** Fachada del tablero: el periodo es una señal; si un servicio cae, solo su tarjeta dice "no disponible" (FR1, FR2). */
@Injectable()
export class TableroFachada {
  private readonly repo = inject(TableroRepositorio);
  readonly periodo = signal<Periodo>('ESTA_SEMANA');
  readonly datos = toSignal(toObservable(this.periodo).pipe(switchMap((periodo) => this.repo.observar(periodo, 30_000))));
  readonly cargando = computed(() => this.datos()?.loading ?? true);

  caido(campo: string): boolean {
    return servicioCaido(this.datos()?.error, campo);
  }
}
