import { inject, Injectable } from '@angular/core';
import { CombustibleGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo de la feature de combustible. */
@Injectable({ providedIn: 'root' })
export class CombustibleRepositorio {
  private readonly gql = inject(CombustibleGQL);

  observar(desde: string, cadaMs: number) {
    return this.gql.watch({ variables: { desde }, pollInterval: cadaMs }).valueChanges;
  }
}
