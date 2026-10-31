import { inject, Injectable } from '@angular/core';
import { CobranzaGQL, type ReporteParams } from '../../graphql/generado';

/** Repositorio sobre Apollo del reporte de cuentas por cobrar (modelo de lectura de Analítica, spec 015). */
@Injectable({ providedIn: 'root' })
export class CobranzaRepositorio {
  private readonly gql = inject(CobranzaGQL);

  observar(params: ReporteParams) {
    return this.gql.watch({ variables: { params } }).valueChanges;
  }
}
