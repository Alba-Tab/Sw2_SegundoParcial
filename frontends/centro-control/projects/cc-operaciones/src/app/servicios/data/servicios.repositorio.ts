import { inject, Injectable } from '@angular/core';
import { CancelarServicioGQL, ServiciosGQL, type EstadoServicio } from '../../graphql/generado';

/** Repositorio sobre Apollo de los servicios confirmados y su cancelación (spec 004). */
@Injectable({ providedIn: 'root' })
export class ServiciosRepositorio {
  private readonly gql = inject(ServiciosGQL);
  private readonly cancelarGql = inject(CancelarServicioGQL);

  /** `verMonto`: el despachador no ve `Servicio.monto`, así que no se le pide (sin un SIN_PERMISO por fila). */
  observar(estado: EstadoServicio, verMonto: boolean, cadaMs: number) {
    return this.gql.watch({ variables: { estado, verMonto }, pollInterval: cadaMs }).valueChanges;
  }

  recargar(estado: EstadoServicio, verMonto: boolean) {
    return this.gql.fetch({ variables: { estado, verMonto } });
  }

  cancelar(servicioId: string, motivo: string, clave: string) {
    return this.cancelarGql.mutate({ variables: { servicioId, motivo, clave } });
  }
}
