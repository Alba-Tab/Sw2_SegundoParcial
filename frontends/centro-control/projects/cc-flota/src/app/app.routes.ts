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
      { path: 'unidades', loadComponent: () => import('./paginas/unidades').then((m) => m.UnidadesPagina), title: 'Unidades' },
      { path: 'unidades/:id', loadComponent: () => import('./paginas/unidad').then((m) => m.UnidadPagina), title: 'Unidad' },
      { path: 'combustible', loadComponent: () => import('./paginas/combustible').then((m) => m.CombustiblePagina), title: 'Combustible' },
      { path: 'combustible/:id', loadComponent: () => import('./paginas/combustible').then((m) => m.CombustiblePagina), title: 'Carga' },
      { path: 'conduccion', loadComponent: () => import('./paginas/conduccion').then((m) => m.ConduccionPagina), title: 'Conducción' },
    ],
  },
  { path: '**', redirectTo: '' },
];
