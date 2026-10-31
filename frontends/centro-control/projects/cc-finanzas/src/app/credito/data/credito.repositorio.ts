import { inject, Injectable } from '@angular/core';
import { AprobarCreditoGQL, SolicitudesGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo de las solicitudes de aprobación de crédito (spec 012). */
@Injectable({ providedIn: 'root' })
export class CreditoRepositorio {
  private readonly solicitudesGql = inject(SolicitudesGQL);
  private readonly decidirGql = inject(AprobarCreditoGQL);

  observarSolicitudes(cadaMs: number) {
    return this.solicitudesGql.watch({ pollInterval: cadaMs }).valueChanges;
  }

  recargarSolicitudes() {
    return this.solicitudesGql.fetch();
  }

  decidir(servicioId: string, aprobado: boolean, motivo: string | undefined, clave: string) {
    return this.decidirGql.mutate({ variables: { servicioId, aprobado, motivo, clave } });
  }
}
