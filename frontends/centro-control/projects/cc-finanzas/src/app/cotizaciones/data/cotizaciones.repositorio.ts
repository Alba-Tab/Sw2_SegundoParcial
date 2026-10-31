import { inject, Injectable } from '@angular/core';
import { CotizacionesGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo de las cotizaciones (con las copias de clientes y rutas). */
@Injectable({ providedIn: 'root' })
export class CotizacionesRepositorio {
  private readonly gql = inject(CotizacionesGQL);

  observar(cadaMs: number) {
    return this.gql.watch({ pollInterval: cadaMs }).valueChanges;
  }
}
