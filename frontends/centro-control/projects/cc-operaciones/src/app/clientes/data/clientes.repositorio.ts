import { inject, Injectable } from '@angular/core';
import { conservarUltimoBueno } from 'ui-comun';

/** La línea de crédito de cada cliente sale de Finanzas: si cae, se conserva la última leída (FB-1). */
const LINEA_POR_CLIENTE = { clientes: { clave: 'clienteId', campos: ['lineaCredito'] } };
import { ClienteGQL, ClientesGQL } from '../../graphql/generado';

/** Repositorio sobre Apollo de los clientes (G7). */
@Injectable({ providedIn: 'root' })
export class ClientesRepositorio {
  private readonly clientesGql = inject(ClientesGQL);
  private readonly clienteGql = inject(ClienteGQL);

  /** `verCredito`: la línea solo se pide a quien la puede ver (el despachador no). */
  observarClientes(verCredito: boolean, cadaMs: number) {
    return this.clientesGql
      .watch({ variables: { verCredito }, pollInterval: cadaMs })
      .valueChanges.pipe(conservarUltimoBueno(undefined, LINEA_POR_CLIENTE));
  }

  observarCliente(clienteId: string, verCredito: boolean, verMonto: boolean) {
    return this.clienteGql.watch({ variables: { clienteId, verCredito, verMonto } }).valueChanges;
  }
}
