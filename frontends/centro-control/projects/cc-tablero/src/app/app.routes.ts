import type { Routes } from '@angular/router';
import { SinAcceso, soloInternos } from 'ui-comun';
import { entrada } from './entrada';

export const rutas: Routes = [
  { path: 'sin-acceso', component: SinAcceso },
  {
    path: '',
    canActivate: [soloInternos, entrada],
    children: [
      { path: '', loadComponent: () => import('./tablero/tablero').then((m) => m.TableroPagina), title: 'Tablero' },
      { path: 'reportes', loadComponent: () => import('./reportes/reportes').then((m) => m.ReportesPagina), title: 'Reportes' },
    ],
  },
  { path: '**', redirectTo: '' },
];
