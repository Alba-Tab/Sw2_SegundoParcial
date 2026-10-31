import type { Routes } from '@angular/router';
import { SinAcceso, soloInternos, soloRoles } from 'ui-comun';
import { entrada } from './entrada';
import { ROLES_PAGINA } from './tablero/domain/tablero';

export const rutas: Routes = [
  { path: 'sin-acceso', component: SinAcceso },
  {
    path: '',
    canActivate: [soloInternos, entrada],
    children: [
      { path: '', loadComponent: () => import('./tablero/ui/tablero').then((m) => m.TableroPagina), title: 'Tablero' },
      {
        // comercial no tiene reportes en el catálogo y Analítica le responde 403 (spec 015).
        path: 'reportes',
        canActivate: [soloRoles(...ROLES_PAGINA.reportes)],
        loadComponent: () => import('./reportes/ui/reportes').then((m) => m.ReportesPagina),
        title: 'Reportes',
      },
      {
        path: 'voz',
        canActivate: [soloRoles(...ROLES_PAGINA.voz)],
        loadComponent: () => import('./voz/ui/voz').then((m) => m.VozPagina),
        title: 'Pregunta por voz',
      },
      {
        path: 'agente',
        canActivate: [soloRoles(...ROLES_PAGINA.agente)],
        loadComponent: () => import('./agente/ui/agente').then((m) => m.AgentePagina),
        title: 'Agente',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
