import { inject, Injectable } from '@angular/core';
import { CrearRutaGQL, EditarRutaGQL, RutaGQL, RutasGQL, type RutaInput } from '../../graphql/generado';

/** Repositorio sobre Apollo de las rutas (G4): lista, ficha por id, alta y edición. */
@Injectable({ providedIn: 'root' })
export class RutasRepositorio {
  private readonly gql = inject(RutasGQL);
  private readonly rutaGql = inject(RutaGQL);
  private readonly crearGql = inject(CrearRutaGQL);
  private readonly editarGql = inject(EditarRutaGQL);

  /** El `QueryRef`: tras un alta, `refetch` trae la ruta nueva a la lista. */
  observar() {
    return this.gql.watch();
  }

  /** El `QueryRef`: `recargar` hace `refetch` sobre él (V4-1). */
  observarRuta(id: string) {
    return this.rutaGql.watch({ variables: { id } });
  }

  crear(input: RutaInput) {
    return this.crearGql.mutate({ variables: { input } });
  }

  editar(rutaId: string, input: RutaInput) {
    return this.editarGql.mutate({ variables: { rutaId, input } });
  }
}
