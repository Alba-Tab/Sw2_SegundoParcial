import { afterNextRender, Component, type ElementRef, input, output, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { Icono } from 'ui-comun/dominio';

/**
 * Confirmación en línea de una acción que no se deshace (Fase E): dice qué va a pasar y pide un segundo clic. Toma el
 * foco al aparecer para que el teclado y el lector de pantalla lleguen al resumen; "No, volver" no hace nada.
 */
@Component({
  selector: 'cc-confirmacion',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="confirmacion">
      <p class="resumen" tabindex="-1" #texto>
        <mat-icon>warning</mat-icon><span>{{ resumen() }}</span>
      </p>
      <div class="fila-acciones">
        <button mat-flat-button (click)="confirmar.emit()" [disabled]="enviando()">
          <mat-icon>{{ icono() }}</mat-icon
          >{{ accion() }}
        </button>
        <button mat-button (click)="volver.emit()" [disabled]="enviando()">No, volver</button>
      </div>
    </div>
  `,
  styles: `
    .confirmacion {
      margin: 8px 0;
      padding: 8px 12px;
      border-radius: var(--mat-sys-corner-small);
      background: var(--mat-sys-advertencia-container);
      color: var(--mat-sys-on-advertencia-container);
    }
    .resumen {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin: 4px 0 0;
      font: var(--mat-sys-body-large);
    }
  `,
})
export class Confirmacion {
  /** Qué va a pasar, en una frase con los datos ("Se registra un pago de 2.800,00 BOB…"). */
  readonly resumen = input.required<string>();
  /** El texto del botón que confirma, en verbo ("Sí, registrar el pago"). */
  readonly accion = input.required<string>();
  readonly icono = input<Icono>('check');
  readonly enviando = input(false);
  readonly confirmar = output();
  readonly volver = output();
  private readonly texto = viewChild.required<ElementRef<HTMLElement>>('texto');

  constructor() {
    afterNextRender(() => this.texto().nativeElement.focus());
  }
}
