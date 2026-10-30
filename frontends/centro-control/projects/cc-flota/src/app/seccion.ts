import { Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-seccion',
  imports: [MatTabsModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <nav mat-tab-nav-bar [tabPanel]="panel" aria-label="Flota">
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
  readonly enlaces = [
    { ruta: 'unidades', titulo: 'Unidades' },
    { ruta: 'combustible', titulo: 'Combustible' },
    { ruta: 'conduccion', titulo: 'Conducción' },
  ];
}
