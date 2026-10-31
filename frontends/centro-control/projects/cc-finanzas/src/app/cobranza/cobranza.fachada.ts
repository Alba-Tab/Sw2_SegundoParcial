import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { completo, type Resultado } from 'ui-comun';
import type { CobranzaQuery } from '../graphql/generado';
import { CobranzaRepositorio } from './data/cobranza.repositorio';
import { paramsCobranza } from './domain/cobranza';

/** Fachada de cuentas por cobrar: responde aunque Finanzas esté caída, con "datos al". */
@Injectable()
export class CobranzaFachada {
  private readonly datos = toSignal(inject(CobranzaRepositorio).observar(paramsCobranza()));
  readonly resultado = computed(() => completo<CobranzaQuery>(this.datos())?.reporte as Resultado | undefined);
  readonly error = computed(() => this.datos()?.error);
}
