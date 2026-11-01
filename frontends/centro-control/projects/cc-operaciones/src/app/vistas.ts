import { Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive } from '@angular/router';
import type { Icono } from 'ui-comun/dominio';

export interface Vista {
  ruta: string;
  titulo: string;
  icono: Icono;
}

/** Las vistas dentro de una pestaña de Operaciones (FL-3): así la sección no pasa de 6 pestañas. */
export const VISTAS = {
  viajes: [
    { ruta: '/viajes', titulo: 'Lista', icono: 'view_list' },
    { ruta: '/viajes/mapa', titulo: 'Mapa en vivo', icono: 'map' },
  ],
  decisiones: [
    { ruta: '/decisiones/entregas-observadas', titulo: 'Entregas observadas', icono: 'warning' },
    { ruta: '/decisiones/intervenciones', titulo: 'Intervenciones', icono: 'error' },
  ],
} satisfies Record<string, Vista[]>;

/** Enlaces a las vistas hermanas; la actual con fondo, peso y `aria-current`, no solo con color. */
@Component({
  selector: 'app-vistas',
  imports: [MatButtonModule, MatIconModule, RouterLink, RouterLinkActive],
  template: `
    <nav [attr.aria-label]="nombre()">
      @for (v of vistas(); track v.ruta) {
        <a mat-button [routerLink]="v.ruta" routerLinkActive="actual" [routerLinkActiveOptions]="exacta" ariaCurrentWhenActive="page"
          ><mat-icon>{{ v.icono }}</mat-icon
          >{{ v.titulo }}</a
        >
      }
    </nav>
  `,
  styles: `
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 16px;
    }
    .actual {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      font-weight: 700;
    }
  `,
})
export class Vistas {
  readonly vistas = input.required<readonly Vista[]>();
  readonly nombre = input.required<string>();
  /** La ruta exacta, sin mirar el filtro de la URL (`/viajes?estado=…` sigue siendo «Lista»). */
  readonly exacta = { paths: 'exact', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' } as const;
}
