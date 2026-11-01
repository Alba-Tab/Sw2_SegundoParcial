import type { Routes } from '@angular/router';
import { NoEncontrada, SinAcceso, soloInternos, soloRoles } from 'ui-comun';
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
        path: 'mantenimientos',
        loadComponent: () => import('./mantenimientos/ui/mantenimientos').then((m) => m.MantenimientosPagina),
        title: 'Mantenimientos',
      },
      { path: 'choferes', loadComponent: () => import('./choferes/ui/choferes').then((m) => m.ChoferesPagina), title: 'Choferes' },
      { path: 'choferes/:id', loadComponent: () => import('./choferes/ui/chofer').then((m) => m.ChoferPagina), title: 'Chofer' },
      {
        path: 'combustible',
        loadComponent: () => import('./combustible/ui/combustible').then((m) => m.CombustiblePagina),
        title: 'Combustible',
      },
      {
        path: 'combustible/:id',
        loadComponent: () => import('./combustible/ui/combustible').then((m) => m.CombustiblePagina),
        title: 'Carga marcada',
      },
      {
        path: 'conduccion',
        loadComponent: () => import('./conduccion/ui/conduccion').then((m) => m.ConduccionPagina),
        title: 'Conducción',
      },
    ],
  },
  { path: '**', component: NoEncontrada, title: 'Página no encontrada' },
];
