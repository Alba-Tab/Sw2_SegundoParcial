import { Component, input } from '@angular/core';

/**
 * Franja de cifras clave (DS3, DESIGN.md «Componentes»): una fila compacta con divisores, como el encabezado de un
 * documento en un ERP. No es una grilla de tarjetas con cifras gigantes (PRODUCT.md, anti-referencias). Va arriba de una
 * ficha (monto, saldo, vence) y en «Cifras del periodo» del Tablero. Cada celda es un `<cc-cifra>`.
 */
@Component({
  selector: 'cc-resumen',
  host: { role: 'list' },
  template: `<ng-content />`,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));
      margin: 0 0 var(--tc-espacio-6);
      background: var(--mat-sys-surface-container-lowest);
      border: var(--tc-borde-fino) solid var(--mat-sys-outline-variant);
      border-radius: var(--tc-radio-md);
      box-shadow: var(--tc-elevacion-1);
      overflow: hidden;
    }
  `,
})
export class Resumen {}

/**
 * Una cifra del resumen: etiqueta, valor (el contenido) y un detalle opcional debajo. Con `tono`, la celda se tinta como
 * el estado que representa; la etiqueta y el detalle dicen por qué (nunca solo color). `completa` ocupa toda la fila.
 */
@Component({
  selector: 'cc-cifra',
  host: {
    role: 'listitem',
    '[attr.data-tono]': 'tono()',
    '[class.completa]': 'completa()',
  },
  template: `
    <span class="etiqueta">{{ etiqueta() }}</span>
    <span class="valor"><ng-content /></span>
    @if (detalle()) {
      <span class="detalle">{{ detalle() }}</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--tc-espacio-1);
      padding: var(--tc-espacio-3) var(--tc-espacio-4);
      min-width: 0;
      /* Divisor a la izquierda y arriba: con auto-fit, la primera de cada fila tapa el suyo con el margen negativo. */
      box-shadow:
        calc(-1 * var(--tc-borde-fino)) 0 0 var(--mat-sys-outline-variant),
        0 calc(-1 * var(--tc-borde-fino)) 0 var(--mat-sys-outline-variant);
    }
    :host(.completa) {
      grid-column: 1 / -1;
    }
    :host([data-tono='aviso']) {
      background: var(--mat-sys-advertencia-container);
      color: var(--mat-sys-on-advertencia-container);
    }
    :host([data-tono='error']) {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .etiqueta {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }
    :host([data-tono]) .etiqueta,
    :host([data-tono]) .detalle {
      color: inherit;
    }
    .valor {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--tc-espacio-2) var(--tc-espacio-4);
      font: var(--mat-sys-title-large);
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }
    .detalle {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class Cifra {
  readonly etiqueta = input.required<string>();
  readonly detalle = input<string>();
  readonly tono = input<'aviso' | 'error' | null>(null);
  readonly completa = input(false);
}
