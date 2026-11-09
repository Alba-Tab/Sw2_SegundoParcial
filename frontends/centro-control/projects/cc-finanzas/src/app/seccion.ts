import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { Icono } from 'ui-comun/dominio';

@Component({
  selector: 'app-seccion',
  imports: [MatTabsModule, MatIconModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <nav mat-tab-nav-bar [tabPanel]="panel" aria-label="Finanzas">
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
  // TODO(G5): pestaña "Tarifas" cuando Finanzas y el Gateway la expongan; ver specs/pendientes.md, sección 1.
  readonly enlaces: { ruta: string; titulo: string; icono: Icono }[] = [
    { ruta: 'facturas', titulo: 'Facturas', icono: 'receipt_long' },
    { ruta: 'cobranza', titulo: 'Cuentas por cobrar', icono: 'account_balance_wallet' },
    { ruta: 'aprobaciones', titulo: 'Aprobación de crédito', icono: 'credit_score' },
    { ruta: 'lineas-credito', titulo: 'Líneas de crédito', icono: 'credit_card' },
    { ruta: 'cotizaciones', titulo: 'Cotizaciones', icono: 'request_quote' },
  ];
}
