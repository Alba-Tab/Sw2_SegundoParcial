import { inject, Injectable } from '@angular/core';
import { RutasGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo de las rutas (G4, solo lectura). */
@Injectable({ providedIn: 'root' })
export class RutasRepositorio {
  private readonly gql = inject(RutasGQL);

  observar() {
    return this.gql.watch().valueChanges;
  }
}
