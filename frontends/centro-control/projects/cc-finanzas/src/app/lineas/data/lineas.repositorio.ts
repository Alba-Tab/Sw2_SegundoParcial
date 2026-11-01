import { inject, Injectable } from '@angular/core';
import { conservarUltimoBueno } from 'ui-comun';

/** La línea de crédito de cada cliente sale de Finanzas: si cae, se conserva la última leída (FB-1). */
const LINEA_POR_CLIENTE = { 'clientes.items': { clave: 'clienteId', campos: ['lineaCredito'] } };
import { LineasCreditoGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo de las líneas de crédito de todos los clientes (G6). */
@Injectable({ providedIn: 'root' })
export class LineasRepositorio {
  private readonly gql = inject(LineasCreditoGQL);

  /** La primera página de clientes, con sondeo. */
  observar(cadaMs: number) {
    return this.gql.watch({ pollInterval: cadaMs }).valueChanges.pipe(conservarUltimoBueno(undefined, LINEA_POR_CLIENTE));
  }

  /** «Cargar más» (E5-1): la página siguiente, una vez y sin sondeo. */
  pagina(despuesDe: string) {
    return this.gql.fetch({ variables: { despuesDe } });
  }
}
