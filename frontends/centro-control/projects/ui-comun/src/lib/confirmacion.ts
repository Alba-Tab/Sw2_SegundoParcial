import { afterNextRender, Component, type ElementRef, input, output, signal, viewChild } from '@angular/core';
import type { AbstractControl } from '@angular/forms';
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
        <!-- type="button": dentro de un <form> no lo envían (V2-1). disabledInteractive: el botón que tiene el foco no
             lo pierde al deshabilitarse mientras se envía; el clic se ignora aquí. -->
        <button mat-flat-button type="button" (click)="enviando() || confirmar.emit()" [disabled]="enviando()" disabledInteractive>
          <mat-icon>{{ icono() }}</mat-icon
          >{{ accion() }}
        </button>
        <button mat-button type="button" (click)="enviando() || volver.emit()" [disabled]="enviando()" disabledInteractive>
          No, volver
        </button>
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

/**
 * Una sola confirmación abierta por página (V2-2, V2-3): abrirla bloquea el control de ese ítem para que el resumen no
 * cambie (E-4); abrir la de otro ítem libera la anterior, así ningún control queda bloqueado para siempre.
 */
export class ConfirmacionUnica {
  /** El ítem que está pidiendo confirmación, o `null`. */
  readonly abierta = signal<string | null>(null);

  constructor(private readonly controlDe: (id: string) => AbstractControl | undefined) {}

  abrir(id: string): void {
    this.cerrar();
    this.controlDe(id)?.disable();
    this.abierta.set(id);
  }

  /** Cierra la confirmación abierta (o solo la de `id`, si es esa) y desbloquea su control. */
  cerrar(id?: string): void {
    const previa = this.abierta();
    if (previa === null || (id !== undefined && id !== previa)) return;
    this.controlDe(previa)?.enable();
    this.abierta.set(null);
  }
}
