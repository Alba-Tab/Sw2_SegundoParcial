import { Component, inject } from '@angular/core';
import { Encabezado, AvisoServicios, TablaReporte, Esqueleto } from 'ui-comun';
import { CobranzaFachada } from '../cobranza.fachada';

/** Cuentas por cobrar (spec 015) desde el modelo de lectura: responde aunque Finanzas esté caída, con "datos al". */
@Component({
  selector: 'app-cobranza',
  providers: [CobranzaFachada],
  imports: [Esqueleto, Encabezado, TablaReporte, AvisoServicios],
  template: `
    <cc-encabezado titulo="Cuentas por cobrar" subtitulo="Vencidas en los últimos 2 meses y por vencer en 30 días" />
    @if (cargando()) {
      <cc-esqueleto />
    }
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
  readonly cargando = this.fachada.cargando;
  readonly campos = { reporte: 'Analítica' };
}
