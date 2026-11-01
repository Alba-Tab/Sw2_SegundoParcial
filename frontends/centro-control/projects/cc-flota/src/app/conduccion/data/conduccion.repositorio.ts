import { inject, Injectable } from '@angular/core';
import { conservarUltimoBueno } from 'ui-comun';
import { ConduccionGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo del puntaje de conducción. */
@Injectable({ providedIn: 'root' })
export class ConduccionRepositorio {
  private readonly gql = inject(ConduccionGQL);

  observar(cadaMs: number) {
    return this.gql.watch({ pollInterval: cadaMs }).valueChanges.pipe(conservarUltimoBueno());
  }
}
