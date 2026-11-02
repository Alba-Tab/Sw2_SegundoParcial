import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { Icono } from 'ui-comun/dominio';

@Component({
  selector: 'app-seccion',
  imports: [MatTabsModule, MatIconModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <nav mat-tab-nav-bar [tabPanel]="panel" aria-label="Flota">
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
  readonly enlaces: { ruta: string; titulo: string; icono: Icono }[] = [
    { ruta: 'unidades', titulo: 'Unidades', icono: 'local_shipping' },
    { ruta: 'mantenimientos', titulo: 'Mantenimientos', icono: 'build' },
    { ruta: 'choferes', titulo: 'Choferes', icono: 'id_card' },
    { ruta: 'combustible', titulo: 'Combustible', icono: 'local_gas_station' },
    { ruta: 'conduccion', titulo: 'Conducción', icono: 'speed' },
  ];
}
