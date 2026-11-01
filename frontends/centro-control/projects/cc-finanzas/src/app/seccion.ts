import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-seccion',
  imports: [MatTabsModule, MatIconModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <nav mat-tab-nav-bar [tabPanel]="panel" aria-label="Finanzas">
      @for (e of enlaces; track e.ruta) {
        <a mat-tab-link [routerLink]="e.ruta" routerLinkActive #a="routerLinkActive" [active]="a.isActive"
          ><mat-icon>{{ e.icono }}</mat-icon
          >{{ e.titulo }}</a
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
  readonly enlaces = [
    { ruta: 'facturas', titulo: 'Facturas y pagos', icono: 'receipt_long' },
    { ruta: 'cobranza', titulo: 'Cuentas por cobrar', icono: 'account_balance_wallet' },
    { ruta: 'aprobaciones', titulo: 'Aprobación de crédito', icono: 'credit_score' },
    { ruta: 'cotizaciones', titulo: 'Cotizaciones', icono: 'request_quote' },
  ];
}
