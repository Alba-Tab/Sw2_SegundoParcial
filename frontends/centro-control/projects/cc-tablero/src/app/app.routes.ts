import type { Routes } from '@angular/router';
import { SinAcceso, soloInternos, soloRoles } from 'ui-comun';
import { entrada } from './entrada';

export const rutas: Routes = [
  { path: 'sin-acceso', component: SinAcceso },
  {
    path: '',
    canActivate: [soloInternos, entrada],
    children: [
      { path: '', loadComponent: () => import('./tablero/tablero').then((m) => m.TableroPagina), title: 'Tablero' },
      { path: 'reportes', loadComponent: () => import('./reportes/reportes').then((m) => m.ReportesPagina), title: 'Reportes' },
      {
        path: 'voz',
        canActivate: [soloRoles('gerente', 'administracion', 'despachador', 'jefe_flota')],
        loadComponent: () => import('./voz/voz').then((m) => m.VozPagina),
        title: 'Pregunta por voz',
      },
      {
        path: 'agente',
        canActivate: [soloRoles('gerente', 'despachador')],
        loadComponent: () => import('./agente/agente').then((m) => m.AgentePagina),
        title: 'Agente',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
