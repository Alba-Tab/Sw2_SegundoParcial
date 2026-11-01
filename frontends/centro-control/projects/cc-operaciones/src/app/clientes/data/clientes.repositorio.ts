import { inject, Injectable } from '@angular/core';
import { conservarUltimoBueno } from 'ui-comun';
import { ClienteGQL, ClientesGQL, EditarClienteGQL, type ClienteEdicionInput } from '../../graphql/generado';

/** La línea de crédito de cada cliente sale de Finanzas: si cae, se conserva la última leída (FB-1). */
const LINEA_POR_CLIENTE = { 'clientes.items': { clave: 'clienteId', campos: ['lineaCredito'] } };

/** Repositorio sobre Apollo de los clientes (G7). */
@Injectable({ providedIn: 'root' })
export class ClientesRepositorio {
  private readonly clientesGql = inject(ClientesGQL);
  private readonly clienteGql = inject(ClienteGQL);
  private readonly editarGql = inject(EditarClienteGQL);

  /** `verCredito`: la línea solo se pide a quien la puede ver (el despachador no). La primera página, con sondeo. */
  observarClientes(verCredito: boolean, cadaMs: number) {
    return this.clientesGql
      .watch({ variables: { verCredito }, pollInterval: cadaMs })
      .valueChanges.pipe(conservarUltimoBueno(undefined, LINEA_POR_CLIENTE));
  }

  /** «Cargar más» (E5-1): la página siguiente, una vez y sin sondeo. */
  pagina(verCredito: boolean, despuesDe: string) {
    return this.clientesGql.fetch({ variables: { verCredito, despuesDe } });
  }

  /** El `QueryRef`: `recargar` hace `refetch` sobre él (V4-1). */
  observarCliente(clienteId: string, verCredito: boolean, verMonto: boolean) {
    return this.clienteGql.watch({ variables: { clienteId, verCredito, verMonto } });
  }

  editar(clienteId: string, input: ClienteEdicionInput) {
    return this.editarGql.mutate({ variables: { clienteId, input } });
  }
}
