import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Sesion } from 'ui-comun';
import type { Icono } from 'ui-comun/dominio';
import { puedeAbrir, type Pagina } from './tablero/domain/tablero';

const ENLACES: { ruta: '' | Pagina; titulo: string; icono: Icono }[] = [
  { ruta: '', titulo: 'Tablero', icono: 'dashboard' },
  { ruta: 'reportes', titulo: 'Reportes', icono: 'bar_chart' },
  { ruta: 'voz', titulo: 'Pregunta por voz', icono: 'mic' },
  { ruta: 'agente', titulo: 'Agente', icono: 'smart_toy' },
];

/** Pestañas del tablero (N2): reportes y voz (spec 015) y el agente (spec 014), solo para los roles que los usan. */
@Component({
  selector: 'app-seccion',
  imports: [MatTabsModule, MatIconModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <nav mat-tab-nav-bar [tabPanel]="panel" aria-label="Tablero">
      @for (e of enlaces; track e.ruta) {
        <a
          mat-tab-link
          [routerLink]="'/' + e.ruta"
          routerLinkActive
          [routerLinkActiveOptions]="{ exact: !e.ruta }"
          #a="routerLinkActive"
          [active]="a.isActive"
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
  private readonly roles = inject(Sesion).roles();
  /** Las pestañas que el rol puede usar; el guarda de cada ruta y el Gateway vuelven a validar. */
  readonly enlaces = ENLACES.filter((e) => !e.ruta || puedeAbrir(this.roles, e.ruta));
}
