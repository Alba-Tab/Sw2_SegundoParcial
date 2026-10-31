import type { Routes } from '@angular/router';
import { SinAcceso, soloInternos, soloRoles } from 'ui-comun';
import { entrada } from './entrada';

export const rutas: Routes = [
  { path: 'sin-acceso', component: SinAcceso },
  {
    path: '',
    canActivate: [soloInternos, entrada],
    children: [
      { path: '', loadComponent: () => import('./tablero/ui/tablero').then((m) => m.TableroPagina), title: 'Tablero' },
      { path: 'reportes', loadComponent: () => import('./reportes/ui/reportes').then((m) => m.ReportesPagina), title: 'Reportes' },
      {
        path: 'voz',
        canActivate: [soloRoles('gerente', 'administracion', 'despachador', 'jefe_flota')],
        loadComponent: () => import('./voz/ui/voz').then((m) => m.VozPagina),
        title: 'Pregunta por voz',
      },
      {
        path: 'agente',
        canActivate: [soloRoles('gerente', 'despachador')],
        loadComponent: () => import('./agente/ui/agente').then((m) => m.AgentePagina),
        title: 'Agente',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
