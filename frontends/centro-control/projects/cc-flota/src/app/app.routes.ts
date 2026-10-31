import type { Routes } from '@angular/router';
import { SinAcceso, soloInternos, soloRoles } from 'ui-comun';
import { Seccion } from './seccion';

export const rutas: Routes = [
  { path: 'sin-acceso', component: SinAcceso },
  {
    path: '',
    component: Seccion,
    canActivate: [soloInternos, soloRoles('jefe_flota', 'gerente')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'unidades' },
      { path: 'unidades', loadComponent: () => import('./unidades/ui/unidades').then((m) => m.UnidadesPagina), title: 'Unidades' },
      { path: 'unidades/:id', loadComponent: () => import('./unidades/ui/unidad').then((m) => m.UnidadPagina), title: 'Unidad' },
      {
        path: 'combustible',
        loadComponent: () => import('./combustible/ui/combustible').then((m) => m.CombustiblePagina),
        title: 'Combustible',
      },
      {
        path: 'combustible/:id',
        loadComponent: () => import('./combustible/ui/combustible').then((m) => m.CombustiblePagina),
        title: 'Carga',
      },
      {
        path: 'conduccion',
        loadComponent: () => import('./conduccion/ui/conduccion').then((m) => m.ConduccionPagina),
        title: 'Conducción',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
