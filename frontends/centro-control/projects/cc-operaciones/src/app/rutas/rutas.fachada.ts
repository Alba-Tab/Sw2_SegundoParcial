import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { cargandoDe, completo } from 'ui-comun';
import type { RutasQuery } from '../graphql/generado';
import { RutasRepositorio } from './data/rutas.repositorio';
import { buscarRuta } from './domain/ruta';

/** Fachada de las rutas: cambian poco, sin sondeo. La lista y la ficha leen la misma consulta (caché de Apollo). */
@Injectable()
export class RutasFachada {
  private readonly datos = toSignal(inject(RutasRepositorio).observar());
  readonly cargado = computed(() => !!completo<RutasQuery>(this.datos())?.rutas);
  readonly rutas = computed(() => completo<RutasQuery>(this.datos())?.rutas ?? []);
  readonly error = computed(() => this.datos()?.error);
  readonly cargando = computed(() => cargandoDe(this.datos()));

  ruta(id: string) {
    return buscarRuta(this.rutas(), id);
  }
}
