import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { servicioCaido, Sesion, sinPermiso } from 'ui-comun';
import type { Periodo } from '../graphql/generado';
import { TableroRepositorio } from './data/tablero.repositorio';
import { bloquesVisibles, puedeAbrir, type EstadoTarjeta, type Pagina } from './domain/tablero';

/**
 * Fachada del tablero: el periodo es una señal y cada bloque se pide solo al rol que lo puede ver. Si un servicio cae,
 * solo su tarjeta dice "no disponible" (FR1, FR2); si el rol no tiene acceso a un bloque pedido, "sin acceso".
 */
@Injectable()
export class TableroFachada {
  private readonly repo = inject(TableroRepositorio);
  private readonly sesion = inject(Sesion);
  /** Los roles del token no cambian al renovarlo: se leen una vez por página. */
  readonly bloques = bloquesVisibles(this.sesion.roles());
  readonly periodo = signal<Periodo>('ESTA_SEMANA');
  readonly datos = toSignal(
    toObservable(this.periodo).pipe(switchMap((periodo) => this.repo.observar({ periodo, ...this.bloques }, 30_000))),
  );
  readonly cargando = computed(() => this.datos()?.loading ?? true);

  estado(campo: string): EstadoTarjeta {
    const error = this.datos()?.error;
    if (servicioCaido(error, campo)) return 'no-disponible';
    return sinPermiso(error, campo) ? 'sin-acceso' : null;
  }

  puedeAbrir(pagina: Pagina): boolean {
    return puedeAbrir(this.sesion.roles(), pagina);
  }
}
