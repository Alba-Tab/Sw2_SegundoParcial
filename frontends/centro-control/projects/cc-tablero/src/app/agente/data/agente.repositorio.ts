import { inject, Injectable } from '@angular/core';
import { DispararMisionGQL, MisionesGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo de las misiones del agente (spec 014). */
@Injectable({ providedIn: 'root' })
export class AgenteRepositorio {
  private readonly misionesGql = inject(MisionesGQL);
  private readonly dispararGql = inject(DispararMisionGQL);

  observarMisiones(cadaMs: number) {
    return this.misionesGql.watch({ pollInterval: cadaMs }).valueChanges;
  }

  disparar(clave: string) {
    return this.dispararGql.mutate({ variables: { clave } });
  }
}
