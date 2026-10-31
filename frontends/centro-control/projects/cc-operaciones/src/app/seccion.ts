import { Component, inject } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Sesion } from 'ui-comun';

/** Las acciones del agente (accionesPropuestas): gerente y despachador (spec 014); comercial no las ve. */
export const ROLES_ACCIONES = ['gerente', 'despachador'];

const ENLACES: { ruta: string; titulo: string; roles?: string[] }[] = [
  { ruta: 'viajes', titulo: 'Viajes' },
  { ruta: 'mapa', titulo: 'Mapa en vivo' },
  { ruta: 'entregas-observadas', titulo: 'Entregas observadas' },
  { ruta: 'intervenciones', titulo: 'Intervenciones' },
  { ruta: 'servicios', titulo: 'Servicios' },
  { ruta: 'acciones', titulo: 'Acciones del agente', roles: ROLES_ACCIONES },
];

@Component({
  selector: 'app-seccion',
  imports: [MatTabsModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <nav mat-tab-nav-bar [tabPanel]="panel" aria-label="Operaciones">
      @for (e of enlaces; track e.ruta) {
        <a mat-tab-link [routerLink]="e.ruta" routerLinkActive #a="routerLinkActive" [active]="a.isActive">{{ e.titulo }}</a>
      }
    </nav>
    <mat-tab-nav-panel #panel
      ><div class="pagina"><router-outlet /></div
    ></mat-tab-nav-panel>
  `,
  styles: `
    .pagina {
      padding-top: 16px;
    }
  `,
})
export class Seccion {
  private readonly sesion = inject(Sesion);
  /** Las pestañas que el rol puede usar; el guarda de cada ruta y el Gateway vuelven a validar. */
  readonly enlaces = ENLACES.filter((e) => !e.roles || this.sesion.tiene(...e.roles));
}
