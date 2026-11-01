import { inject, Injectable } from '@angular/core';
import { conservarUltimoBueno } from 'ui-comun';

/** La línea de crédito de cada cliente sale de Finanzas: si cae, se conserva la última leída (FB-1). */
const LINEA_POR_CLIENTE = { clientes: { clave: 'clienteId', campos: ['lineaCredito'] } };
import { LineasCreditoGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo de las líneas de crédito de todos los clientes (G6). */
@Injectable({ providedIn: 'root' })
export class LineasRepositorio {
  private readonly gql = inject(LineasCreditoGQL);

  observar(cadaMs: number) {
    return this.gql.watch({ pollInterval: cadaMs }).valueChanges.pipe(conservarUltimoBueno(undefined, LINEA_POR_CLIENTE));
  }
}
