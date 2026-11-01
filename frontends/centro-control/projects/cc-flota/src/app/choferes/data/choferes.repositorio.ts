import { inject, Injectable } from '@angular/core';
import { conservarUltimoBueno } from 'ui-comun';
import { ChoferesGQL, ChoferGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo de los choferes (G3, solo lectura). */
@Injectable({ providedIn: 'root' })
export class ChoferesRepositorio {
  private readonly choferesGql = inject(ChoferesGQL);
  private readonly choferGql = inject(ChoferGQL);

  observarChoferes(cadaMs: number) {
    return this.choferesGql.watch({ pollInterval: cadaMs }).valueChanges.pipe(conservarUltimoBueno());
  }

  observarChofer(choferId: string) {
    return this.choferGql.watch({ variables: { choferId } }).valueChanges;
  }
}
