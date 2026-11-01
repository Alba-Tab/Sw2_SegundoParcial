import { inject, Injectable } from '@angular/core';
import { AccionesGQL, AprobarAccionGQL, RechazarAccionGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo de las acciones propuestas por el agente (spec 014). */
@Injectable({ providedIn: 'root' })
export class AccionesRepositorio {
  private readonly gql = inject(AccionesGQL);
  private readonly aprobarGql = inject(AprobarAccionGQL);
  private readonly rechazarGql = inject(RechazarAccionGQL);

  /** El `QueryRef`: `recargar` hace `refetch` sobre él, así la señal ya cambió cuando resuelve (V4-1). */
  observar(cadaMs: number) {
    return this.gql.watch({ pollInterval: cadaMs });
  }

  aprobar(id: string, mensaje: string, clave: string) {
    return this.aprobarGql.mutate({ variables: { id, mensaje, clave } });
  }

  rechazar(id: string, motivo: string | undefined, clave: string) {
    return this.rechazarGql.mutate({ variables: { id, motivo, clave } });
  }
}
