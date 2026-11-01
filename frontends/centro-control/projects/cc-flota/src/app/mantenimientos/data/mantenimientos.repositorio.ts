import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { conservarUltimoBueno } from 'ui-comun';
import { MantenimientosGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo de la lista de mantenimientos (G9). */
@Injectable({ providedIn: 'root' })
export class MantenimientosRepositorio {
  private readonly gql = inject(MantenimientosGQL);

  observar(cadaMs: number) {
    return this.gql.watch({ pollInterval: cadaMs }).valueChanges.pipe(conservarUltimoBueno());
  }

  /** La página que sigue a `despuesDe`, una sola vez y sin caché (la primera la trae el sondeo). */
  async pagina(despuesDe: string) {
    const { data } = await firstValueFrom(this.gql.fetch({ variables: { despuesDe }, fetchPolicy: 'network-only' }));
    return data?.mantenimientos;
  }
}
