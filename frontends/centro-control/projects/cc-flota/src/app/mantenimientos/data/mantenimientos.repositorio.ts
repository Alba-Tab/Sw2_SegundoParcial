import { inject, Injectable } from '@angular/core';
import { MantenimientosGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo de la lista de mantenimientos (G9). */
@Injectable({ providedIn: 'root' })
export class MantenimientosRepositorio {
  private readonly gql = inject(MantenimientosGQL);

  observar(cadaMs: number) {
    return this.gql.watch({ pollInterval: cadaMs }).valueChanges;
  }
}
