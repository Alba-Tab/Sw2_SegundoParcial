import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { completo } from 'ui-comun';
import type { CotizacionesQuery } from '../graphql/generado';
import { CotizacionesRepositorio } from './data/cotizaciones.repositorio';
import { nombreCliente, nombreRuta } from './domain/cotizacion';

/** Fachada de cotizaciones, cada 30 s. */
@Injectable()
export class CotizacionesFachada {
  private readonly datos = toSignal(inject(CotizacionesRepositorio).observar(30_000));
  private readonly d = computed(() => completo<CotizacionesQuery>(this.datos()));
  readonly cotizaciones = computed(() => this.d()?.cotizaciones ?? []);
  readonly error = computed(() => this.datos()?.error);

  nombreCliente(id: string): string {
    return nombreCliente(this.d()?.clientes, id);
  }

  nombreRuta(id: string): string {
    return nombreRuta(this.d()?.rutas, id);
  }
}
