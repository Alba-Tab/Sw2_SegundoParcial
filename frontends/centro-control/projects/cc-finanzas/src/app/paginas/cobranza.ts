import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { completo, fechaLaPaz, mensajeDe, TablaReporte, type Resultado } from 'ui-comun';
import { CobranzaGQL, type CobranzaQuery, type ReporteParams } from '../graphql/generado';

/** Analítica limita CUENTAS_POR_COBRAR a 92 días contando los dos extremos: 61 días hacia atrás y 30 hacia adelante. */
export const DIAS_ATRAS = 61;
export const DIAS_ADELANTE = 30;

export const paramsCobranza = (ahora = new Date()): ReporteParams => ({
  desde: fechaLaPaz(-DIAS_ATRAS, ahora),
  hasta: fechaLaPaz(DIAS_ADELANTE, ahora),
  incluirVencidas: true,
});

/** Cuentas por cobrar (spec 015) desde el modelo de lectura: responde aunque Finanzas esté caída, con "datos al". */
@Component({
  selector: 'app-cobranza',
  imports: [TablaReporte],
  template: `
    <h1>Cuentas por cobrar: vencidas en los últimos 2 meses y por vencer en 30 días</h1>
    @if (error(); as e) {
      <p class="no-disponible" role="alert">{{ e }}</p>
    }
    @if (resultado(); as r) {
      <cc-tabla-reporte [resultado]="r" />
    }
  `,
})
export class CobranzaPagina {
  private readonly datos = toSignal(inject(CobranzaGQL).watch({ variables: { params: paramsCobranza() } }).valueChanges);
  readonly resultado = computed(() => completo<CobranzaQuery>(this.datos())?.reporte as Resultado | undefined);
  readonly error = computed(() => {
    const error = this.datos()?.error;
    return error && !this.resultado() ? mensajeDe(error) : null;
  });
}
