import { inject, Injectable } from '@angular/core';
import { conservarUltimoBueno } from 'ui-comun';
import { LineasCreditoGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo de las líneas de crédito de todos los clientes (G6). */
@Injectable({ providedIn: 'root' })
export class LineasRepositorio {
  private readonly gql = inject(LineasCreditoGQL);

  observar(cadaMs: number) {
    return this.gql.watch({ pollInterval: cadaMs }).valueChanges.pipe(conservarUltimoBueno());
  }
}
