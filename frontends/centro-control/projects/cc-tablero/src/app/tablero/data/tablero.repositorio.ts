import { inject, Injectable } from '@angular/core';
import { TableroGQL, type Periodo } from '../../graphql/generado';

/** Repositorio sobre Apollo del tablero: Viajes, Flota, Finanzas y Analítica en una consulta (spec 016, paso 10). */
@Injectable({ providedIn: 'root' })
export class TableroRepositorio {
  private readonly gql = inject(TableroGQL);

  observar(periodo: Periodo, cadaMs: number) {
    return this.gql.watch({ variables: { periodo }, pollInterval: cadaMs }).valueChanges;
  }
}
