import { Component, inject } from '@angular/core';
import { AvisoServicios, TablaReporte } from 'ui-comun';
import { CobranzaFachada } from '../cobranza.fachada';

/** Cuentas por cobrar (spec 015) desde el modelo de lectura: responde aunque Finanzas esté caída, con "datos al". */
@Component({
  selector: 'app-cobranza',
  providers: [CobranzaFachada],
  imports: [TablaReporte, AvisoServicios],
  template: `
    <h1>Cuentas por cobrar: vencidas en los últimos 2 meses y por vencer en 30 días</h1>
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!resultado()" />
    @if (resultado(); as r) {
      <cc-tabla-reporte [resultado]="r" />
    }
  `,
})
export class CobranzaPagina {
  private readonly fachada = inject(CobranzaFachada);
  readonly resultado = this.fachada.resultado;
  readonly error = this.fachada.error;
  readonly campos = { reporte: 'Analítica' };
}
