import { inject, Injectable } from '@angular/core';
import { conservarUltimoBueno } from 'ui-comun';
import { FacturaGQL, FacturasGQL, RegistrarPagoGQL, type PagoInput } from '../../graphql/generado';

/** Repositorio sobre Apollo de facturas y pagos (spec 008). */
@Injectable({ providedIn: 'root' })
export class FacturasRepositorio {
  private readonly facturasGql = inject(FacturasGQL);
  private readonly facturaGql = inject(FacturaGQL);
  private readonly pagarGql = inject(RegistrarPagoGQL);

  observarFacturas(conSaldo: boolean | null, cadaMs: number) {
    return this.facturasGql.watch({ variables: { conSaldo }, pollInterval: cadaMs }).valueChanges.pipe(conservarUltimoBueno());
  }

  /** Devuelve el `QueryRef`: `recargar` hace `refetch` sobre él, así el saldo ya cambió cuando resuelve (V4-1). */
  observarFactura(id: string) {
    return this.facturaGql.watch({ variables: { id } });
  }

  registrarPago(input: PagoInput) {
    return this.pagarGql.mutate({ variables: { input } });
  }
}
