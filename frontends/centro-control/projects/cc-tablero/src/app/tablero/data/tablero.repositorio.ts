import { inject, Injectable } from '@angular/core';
import { TableroGQL, type TableroQueryVariables } from '../../graphql/generado';

/** Repositorio sobre Apollo del tablero: Viajes, Flota, Finanzas y Analítica en una consulta (spec 016, paso 10). */
@Injectable({ providedIn: 'root' })
export class TableroRepositorio {
  private readonly gql = inject(TableroGQL);

  /** Las variables dicen el periodo y qué bloques pide el rol (`@include`). */
  observar(variables: TableroQueryVariables, cadaMs: number) {
    return this.gql.watch({ variables, pollInterval: cadaMs }).valueChanges;
  }
}
