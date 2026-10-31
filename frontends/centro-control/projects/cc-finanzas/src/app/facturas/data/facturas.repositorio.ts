import { inject, Injectable } from '@angular/core';
import { FacturaGQL, FacturasGQL, RegistrarPagoGQL, type PagoInput } from '../../graphql/generado';

/** Repositorio sobre Apollo de facturas y pagos (spec 008). */
@Injectable({ providedIn: 'root' })
export class FacturasRepositorio {
  private readonly facturasGql = inject(FacturasGQL);
  private readonly facturaGql = inject(FacturaGQL);
  private readonly pagarGql = inject(RegistrarPagoGQL);

  observarFacturas(conSaldo: boolean | null, cadaMs: number) {
    return this.facturasGql.watch({ variables: { conSaldo }, pollInterval: cadaMs }).valueChanges;
  }

  observarFactura(id: string) {
    return this.facturaGql.watch({ variables: { id } }).valueChanges;
  }

  recargarFactura(id: string) {
    return this.facturaGql.fetch({ variables: { id } });
  }

  registrarPago(input: PagoInput) {
    return this.pagarGql.mutate({ variables: { input } });
  }
}
