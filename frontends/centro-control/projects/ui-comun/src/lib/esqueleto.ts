import { Component, computed, input } from '@angular/core';

/**
 * Carga sin datos (DESIGN.md, "Vacío, carga y error"): líneas grises con la forma de lo que viene, en vez de una barra
 * suelta. El lector de pantalla oye "Cargando". Sin pulso si el sistema pide menos movimiento.
 */
@Component({
  selector: 'cc-esqueleto',
  template: `
    <div role="status">
      <span class="cdk-visually-hidden">Cargando…</span>
      @for (i of lineas(); track i) {
        <div class="linea" aria-hidden="true"></div>
      }
    </div>
  `,
  styles: `
    .linea {
      height: 20px;
      margin: 12px 0;
      border-radius: var(--mat-sys-corner-small);
      background: var(--mat-sys-surface-container-highest);
      animation: pulso 1.2s ease-in-out infinite alternate;
    }
    .linea:nth-of-type(3n + 2) {
      width: 85%;
    }
    .linea:nth-of-type(3n) {
      width: 65%;
    }
    @keyframes pulso {
      to {
        opacity: 0.5;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .linea {
        animation: none;
      }
    }
  `,
})
export class Esqueleto {
  readonly filas = input(4);
  readonly lineas = computed(() => Array.from({ length: this.filas() }, (_, i) => i));
}
