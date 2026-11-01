import { Component, computed, inject, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Encabezado, AvisoServicios, TablaReporte, Esqueleto } from 'ui-comun';
import { CobranzaFachada } from '../cobranza.fachada';
import { filtrarCuentas } from '../domain/cobranza';

/**
 * Cuentas por cobrar (spec 015) desde el modelo de lectura: responde aunque Finanzas esté caída, con "datos al". La
 * búsqueda y el orden son locales; el total sigue siendo el de todas las cuentas y, mientras se busca, se dice.
 */
@Component({
  selector: 'app-cobranza',
  providers: [CobranzaFachada],
  imports: [Esqueleto, Encabezado, TablaReporte, AvisoServicios, MatFormFieldModule, MatInputModule, MatIconModule],
  template: `
    <cc-encabezado titulo="Cuentas por cobrar" subtitulo="Vencidas en los últimos 2 meses y por vencer en 30 días" />
    @if (cargando()) {
      <cc-esqueleto />
    }
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!resultado()" />
    @if (visibles(); as r) {
      <mat-form-field class="busqueda">
        <mat-label>Buscar por cliente o factura</mat-label>
        <mat-icon matPrefix aria-hidden="true">search</mat-icon>
        <input matInput type="search" [value]="busqueda()" (input)="busqueda.set($any($event.target).value)" />
      </mat-form-field>
      <!-- La región viva está siempre; solo cambia su texto, así se anuncia también la primera búsqueda (V2-10). -->
      <p class="secundario" role="status">
        @if (buscando()) {
          {{ r.filas.length === 1 ? '1 cuenta coincide' : r.filas.length + ' cuentas coinciden' }}. La fila Total es de todas las cuentas,
          no solo de las que coinciden.
        }
      </p>
      <cc-tabla-reporte [resultado]="r" [vacio]="buscando() ? 'Ninguna cuenta coincide con la búsqueda.' : 'Sin cuentas por cobrar.'" />
    }
  `,
  styles: `
    .busqueda {
      width: min(360px, 100%);
    }
  `,
})
export class CobranzaPagina {
  private readonly fachada = inject(CobranzaFachada);
  readonly resultado = this.fachada.resultado;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly campos = { reporte: 'Analítica' };
  readonly busqueda = signal('');
  readonly buscando = computed(() => !!this.busqueda().trim());
  readonly visibles = computed(() => {
    const r = this.resultado();
    return r && filtrarCuentas(r, this.busqueda());
  });
}
