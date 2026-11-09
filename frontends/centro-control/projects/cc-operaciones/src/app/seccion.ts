import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Sesion } from 'ui-comun';
import type { Icono } from 'ui-comun/dominio';

/** Las acciones del agente (accionesPropuestas): gerente y despachador (spec 014); comercial no las ve. */
export const ROLES_ACCIONES = ['gerente', 'despachador'];

/** Seis pestañas como máximo (FL-3): el mapa es una vista de Viajes y las dos colas de decisión van juntas. */
export const ENLACES: { ruta: string; titulo: string; icono: Icono; roles?: string[] }[] = [
  { ruta: 'viajes', titulo: 'Viajes', icono: 'route' },
  { ruta: 'decisiones', titulo: 'Decisiones', icono: 'pending_actions' },
  { ruta: 'servicios', titulo: 'Servicios', icono: 'assignment' },
  { ruta: 'clientes', titulo: 'Clientes', icono: 'groups' },
  { ruta: 'rutas', titulo: 'Rutas', icono: 'alt_route' },
  { ruta: 'acciones', titulo: 'Acciones del agente', icono: 'smart_toy', roles: ROLES_ACCIONES },
];

@Component({
  selector: 'app-seccion',
  imports: [MatTabsModule, MatIconModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <nav mat-tab-nav-bar [tabPanel]="panel" aria-label="Operaciones">
      @for (e of enlaces; track e.ruta) {
        <a mat-tab-link [routerLink]="e.ruta" routerLinkActive #a="routerLinkActive" [active]="a.isActive"
          ><mat-icon>{{ e.icono }}</mat-icon
          ><span class="texto-pestana">{{ e.titulo }}</span></a
        >
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
