import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { completo, TablaReporte, type Resultado } from 'ui-comun';
import { CobranzaGQL, type CobranzaQuery } from '../graphql/generado';

const hoy = () => new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
const en = (dias: number) => new Date(Date.now() - 4 * 3600_000 + dias * 86_400_000).toISOString().slice(0, 10);

/** Cuentas por cobrar (spec 015) desde el modelo de lectura: responde aunque Finanzas esté caída, con "datos al". */
@Component({
  selector: 'app-cobranza',
  imports: [TablaReporte],
  template: `
    <h1>Cuentas por cobrar: vencidas y próximos 30 días</h1>
    @if (resultado(); as r) {
      <cc-tabla-reporte [resultado]="r" />
    }
  `,
})
export class CobranzaPagina {
  private readonly datos = toSignal(
    inject(CobranzaGQL).watch({ variables: { params: { desde: en(-90), hasta: en(30), incluirVencidas: true } } }).valueChanges,
  );
  readonly resultado = computed(() => completo<CobranzaQuery>(this.datos())?.reporte as Resultado | undefined);
  readonly hoy = hoy;
}
