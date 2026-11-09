import { inject, Injectable } from '@angular/core';
import { conservarUltimoBueno } from 'ui-comun';
import {
  CambiarHabilitacionChoferGQL,
  ChoferesGQL,
  ChoferGQL,
  EditarChoferGQL,
  type CambiarHabilitacionChoferMutationVariables,
  type ChoferEdicionInput,
} from '../../graphql/generado';

/** Repositorio sobre Apollo de los choferes (G3): lectura, edición y habilitación (D104). */
@Injectable({ providedIn: 'root' })
export class ChoferesRepositorio {
  private readonly choferesGql = inject(ChoferesGQL);
  private readonly choferGql = inject(ChoferGQL);
  private readonly editarGql = inject(EditarChoferGQL);
  private readonly habilitacionGql = inject(CambiarHabilitacionChoferGQL);

  observarChoferes(cadaMs: number) {
    return this.choferesGql.watch({ pollInterval: cadaMs }).valueChanges.pipe(conservarUltimoBueno());
  }

  /** La página que sigue a `despuesDe`, una sola vez y sin caché (la primera la trae el sondeo). */
  pagina(despuesDe: string) {
    return this.choferesGql.fetch({ variables: { despuesDe }, fetchPolicy: 'network-only' });
  }

  /** El `QueryRef`: `recargar` hace `refetch` sobre él (V4-1). */
  observarChofer(choferId: string) {
    return this.choferGql.watch({ variables: { choferId } });
  }

  editar(input: ChoferEdicionInput) {
    return this.editarGql.mutate({ variables: { input } });
  }

  cambiarHabilitacion(variables: CambiarHabilitacionChoferMutationVariables) {
    return this.habilitacionGql.mutate({ variables });
  }
}
