import { inject, Injectable } from '@angular/core';
import { CancelarServicioGQL, ServiciosGQL, type EstadoServicio } from '../../graphql/generado';

/** Repositorio sobre Apollo de los servicios confirmados y su cancelación (spec 004). */
@Injectable({ providedIn: 'root' })
export class ServiciosRepositorio {
  private readonly gql = inject(ServiciosGQL);
  private readonly cancelarGql = inject(CancelarServicioGQL);

  observar(estado: EstadoServicio, cadaMs: number) {
    return this.gql.watch({ variables: { estado }, pollInterval: cadaMs }).valueChanges;
  }

  recargar(estado: EstadoServicio) {
    return this.gql.fetch({ variables: { estado } });
  }

  cancelar(servicioId: string, motivo: string, clave: string) {
    return this.cancelarGql.mutate({ variables: { servicioId, motivo, clave } });
  }
}
