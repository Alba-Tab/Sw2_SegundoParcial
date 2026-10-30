import type { Routes } from '@angular/router';
import { SinAcceso, soloInternos, soloRoles } from 'ui-comun';
import { Seccion } from './seccion';

const p = (carga: () => Promise<unknown>, title: string) => ({ loadComponent: carga as never, title });

export const rutas: Routes = [
  { path: 'sin-acceso', component: SinAcceso },
  {
    path: '',
    component: Seccion,
    canActivate: [soloInternos, soloRoles('despachador', 'comercial', 'gerente')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'viajes' },
      { path: 'viajes', ...p(() => import('./paginas/viajes').then((m) => m.ViajesPagina), 'Viajes') },
      { path: 'viajes/:id', ...p(() => import('./paginas/viaje').then((m) => m.ViajePagina), 'Viaje') },
      { path: 'mapa', ...p(() => import('./paginas/mapa').then((m) => m.MapaPagina), 'Mapa en vivo') },
      { path: 'entregas-observadas', ...p(() => import('./paginas/entregas').then((m) => m.EntregasPagina), 'Entregas observadas') },
      { path: 'intervenciones', ...p(() => import('./paginas/intervenciones').then((m) => m.IntervencionesPagina), 'Intervenciones') },
      { path: 'servicios', ...p(() => import('./paginas/servicios').then((m) => m.ServiciosPagina), 'Servicios') },
      { path: 'acciones', ...p(() => import('./paginas/acciones').then((m) => m.AccionesPagina), 'Acciones del agente') },
      { path: 'acciones/:id', ...p(() => import('./paginas/acciones').then((m) => m.AccionesPagina), 'Acción del agente') },
    ],
  },
  { path: '**', redirectTo: '' },
];
