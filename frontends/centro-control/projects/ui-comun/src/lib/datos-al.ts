import { Component, computed, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { interval, map } from 'rxjs';
import { datosViejos, MINUTOS_DATOS_VIEJOS } from 'ui-comun/dominio';
import { FechaPipe } from './formato';

/**
 * «Datos al …» de lo que sale del modelo de lectura de Analítica (propuesta 4.2). Con más de `MINUTOS_DATOS_VIEJOS` sin
 * datos nuevos va en tono aviso, con ícono y una frase que dice qué significa (FB-7). Sin instante no se muestra.
 */
@Component({
  selector: 'cc-datos-al',
  imports: [MatIconModule, FechaPipe],
  template: `
    @if (al(); as a) {
      <p class="datos-al" [class.viejo]="viejo()">
        @if (viejo()) {
          <mat-icon class="icono-en-linea">warning</mat-icon>
        }
        Datos al {{ a | fecha: true
        }}{{ viejo() ? '. Sin datos nuevos hace más de ' + minutos + ' minutos: las cifras pueden no estar al día.' : '' }}
      </p>
    }
  `,
  styles: `
    .datos-al {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
      margin: 0 0 8px;
    }
    .viejo {
      width: fit-content;
      padding: 4px 12px;
      border-radius: var(--mat-sys-corner-small);
      background: var(--mat-sys-advertencia-container);
      color: var(--mat-sys-on-advertencia-container);
    }
  `,
})
export class DatosAl {
  readonly al = input<string | null | undefined>();
  readonly minutos = MINUTOS_DATOS_VIEJOS;
  /** Se vuelve a mirar cada minuto: sin datos nuevos la respuesta no cambia, y el aviso tiene que aparecer igual. */
  private readonly ahora = toSignal(interval(60_000).pipe(map(() => new Date())), { initialValue: new Date() });
  readonly viejo = computed(() => datosViejos(this.al(), this.ahora()));
}
