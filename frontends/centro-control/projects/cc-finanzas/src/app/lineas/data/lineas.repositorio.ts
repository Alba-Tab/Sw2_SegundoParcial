import { inject, Injectable } from '@angular/core';
import { AjustarLineaCreditoGQL, CambiarEstadoLineaCreditoGQL, LineasCreditoGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo de las líneas de crédito de todos los clientes y su gestión (G6, spec 012). */
@Injectable({ providedIn: 'root' })
export class LineasRepositorio {
  private readonly gql = inject(LineasCreditoGQL);
  private readonly ajustarGql = inject(AjustarLineaCreditoGQL);
  private readonly estadoGql = inject(CambiarEstadoLineaCreditoGQL);

  /** Devuelve el `QueryRef`: `recargar` hace `refetch` sobre él (V4-1). */
  observar(cadaMs: number) {
    return this.gql.watch({ pollInterval: cadaMs });
  }

  ajustar(clienteId: string, limite: string, motivo: string, clave: string) {
    return this.ajustarGql.mutate({ variables: { clienteId, limite, motivo, clave } });
  }

  cambiarEstado(clienteId: string, suspendida: boolean, motivo: string, clave: string) {
    return this.estadoGql.mutate({ variables: { clienteId, suspendida, motivo, clave } });
  }
}
