import { Component, computed, input, Pipe, type PipeTransform } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { etiqueta, type GrupoEtiqueta } from 'ui-comun/dominio';

/**
 * Un estado con texto, icono y tono (DESIGN.md, "Estados"): el color nunca es la única señal. El icono es decorativo
 * (`mat-icon` ya lleva aria-hidden); el texto es lo que lee el lector de pantalla.
 */
@Component({
  selector: 'cc-estado',
  imports: [MatIconModule],
  template: `<mat-icon>{{ e().icono }}</mat-icon
    >{{ e().texto }}`,
  host: { '[attr.data-tono]': 'e().tono' },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px 2px 6px;
      border-radius: var(--mat-sys-corner-full, 999px);
      font: var(--mat-sys-label-large);
      white-space: nowrap;
      vertical-align: middle;
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface-variant);
    }
    mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    :host([data-tono='info']) {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
    :host([data-tono='exito']) {
      background: var(--mat-sys-exito-container);
      color: var(--mat-sys-on-exito-container);
    }
    :host([data-tono='aviso']) {
      background: var(--mat-sys-advertencia-container);
      color: var(--mat-sys-on-advertencia-container);
    }
    :host([data-tono='error']) {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
  `,
})
export class Estado {
  readonly grupo = input.required<GrupoEtiqueta>();
  readonly valor = input<string | null | undefined>();
  readonly e = computed(() => etiqueta(this.grupo(), this.valor()));
}

/** Solo el texto de un valor que no es estado (tipo de carga, de unidad, medio de pago): `{{ x | etiqueta: 'TipoCarga' }}`. */
@Pipe({ name: 'etiqueta' })
export class EtiquetaPipe implements PipeTransform {
  transform(valor: string | null | undefined, grupo: GrupoEtiqueta): string {
    return etiqueta(grupo, valor).texto;
  }
}
