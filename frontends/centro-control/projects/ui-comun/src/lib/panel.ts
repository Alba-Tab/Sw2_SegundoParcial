import { Component, input } from '@angular/core';

let siguiente = 0;

/**
 * Panel (DS2, DESIGN.md «Componentes»): la superficie de una sección de ficha, un formulario de acción o una lista
 * secundaria. Título `h2` con un detalle (`detalle` o `[panel-detalle]`, que admite `cc-estado`) y sus acciones a la derecha
 * (`[panel-acciones]`); el cuerpo debajo. Sin título, solo la superficie (un formulario de parámetros). Con `ras`, el cuerpo
 * va sin relleno para que una tabla llegue al borde. Reemplaza `mat-card` y los `h2` sueltos sobre el fondo.
 */
@Component({
  selector: 'cc-panel',
  template: `
    <section class="panel" [attr.aria-labelledby]="titulo() ? idTitulo() : null" [attr.data-tono]="tono()">
      @if (titulo()) {
        <header class="cabecera">
          <div class="titulos">
            <h2 [id]="idTitulo()" tabindex="-1">{{ titulo() }}</h2>
            @if (detalle()) {
              <span class="detalle">{{ detalle() }}</span>
            }
            <ng-content select="[panel-detalle]" />
          </div>
          <div class="acciones"><ng-content select="[panel-acciones]" /></div>
        </header>
      }
      <div class="cuerpo" [class.ras]="ras()"><ng-content /></div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin: var(--tc-espacio-6) 0;
    }
    .panel {
      background: var(--mat-sys-surface-container-lowest);
      border: var(--tc-borde-fino) solid var(--mat-sys-outline-variant);
      border-radius: var(--tc-radio-md);
      box-shadow: var(--tc-elevacion-1);
      overflow: hidden;
    }
    .cabecera {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--tc-espacio-2) var(--tc-espacio-4);
      min-height: var(--tc-alto-barra);
      padding: var(--tc-espacio-2) var(--tc-espacio-4);
      border-bottom: var(--tc-borde-fino) solid var(--mat-sys-outline-variant);
    }
    /* Lo que pide una decisión (entrega observada, intervención): cabecera tintada con el tono del estado, no una raya. */
    .panel[data-tono='aviso'] {
      border-color: var(--mat-sys-advertencia);
    }
    .panel[data-tono='aviso'] .cabecera {
      background: var(--mat-sys-advertencia-container);
      color: var(--mat-sys-on-advertencia-container);
    }
    .panel[data-tono='error'] {
      border-color: var(--mat-sys-error);
    }
    .panel[data-tono='error'] .cabecera {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .titulos {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--tc-espacio-1) var(--tc-espacio-3);
      min-width: 0;
    }
    .titulos ::ng-deep [panel-detalle] {
      display: inline-flex;
      align-items: center;
      gap: var(--tc-espacio-2);
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    h2 {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
    .detalle {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .acciones {
      display: flex;
      align-items: center;
      gap: var(--tc-espacio-2);
      margin-left: auto;
    }
    .acciones:empty {
      display: none;
    }
    .cuerpo {
      padding: var(--tc-espacio-4);
    }
    .cuerpo.ras {
      padding: 0;
    }
    /* Una tabla dentro del panel ya tiene su borde: no se dibuja dos veces. */
    .cuerpo.ras ::ng-deep .tabla-ancha {
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .cuerpo > ::ng-deep :first-child {
      margin-top: 0;
    }
    .cuerpo > ::ng-deep :last-child {
      margin-bottom: 0;
    }
  `,
})
export class Panel {
  readonly titulo = input<string>();
  /** Un dato al lado del título («3 pagos», «Usado 2.800,00 de 30.000,00 BOB»). */
  readonly detalle = input<string>();
  /** El id del `h2`: la página lo enfoca tras una acción (enfocar(`#titulo-pagos`)). */
  readonly idTitulo = input(`panel-${++siguiente}`);
  readonly ras = input(false);
  /** `aviso` o `error` para un panel que pide una decisión; el texto del título ya dice cuál (nunca solo color). */
  readonly tono = input<'aviso' | 'error' | null>(null);
}
