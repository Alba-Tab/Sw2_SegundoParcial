import type { Routes } from '@angular/router';
import { SinAcceso, soloInternos, soloRoles } from 'ui-comun';
import { Seccion } from './seccion';

export const rutas: Routes = [
  { path: 'sin-acceso', component: SinAcceso },
  {
    path: '',
    component: Seccion,
    canActivate: [soloInternos, soloRoles('administracion', 'gerente')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'facturas' },
      { path: 'facturas', loadComponent: () => import('./paginas/facturas').then((m) => m.FacturasPagina), title: 'Facturas' },
      { path: 'facturas/:id', loadComponent: () => import('./paginas/factura').then((m) => m.FacturaPagina), title: 'Factura' },
      {
        path: 'aprobaciones',
        loadComponent: () => import('./paginas/aprobaciones').then((m) => m.AprobacionesPagina),
        title: 'Aprobación de crédito',
      },
      {
        path: 'cotizaciones',
        loadComponent: () => import('./paginas/cotizaciones').then((m) => m.CotizacionesPagina),
        title: 'Cotizaciones',
      },
      { path: 'cobranza', loadComponent: () => import('./paginas/cobranza').then((m) => m.CobranzaPagina), title: 'Cuentas por cobrar' },
    ],
  },
  { path: '**', redirectTo: '' },
];
