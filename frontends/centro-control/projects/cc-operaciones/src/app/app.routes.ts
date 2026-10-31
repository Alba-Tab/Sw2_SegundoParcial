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
      { path: 'viajes', ...p(() => import('./viajes/ui/viajes').then((m) => m.ViajesPagina), 'Viajes') },
      { path: 'viajes/:id', ...p(() => import('./viajes/ui/viaje').then((m) => m.ViajePagina), 'Viaje') },
      { path: 'mapa', ...p(() => import('./viajes/ui/mapa').then((m) => m.MapaPagina), 'Mapa en vivo') },
      { path: 'entregas-observadas', ...p(() => import('./viajes/ui/entregas').then((m) => m.EntregasPagina), 'Entregas observadas') },
      { path: 'intervenciones', ...p(() => import('./viajes/ui/intervenciones').then((m) => m.IntervencionesPagina), 'Intervenciones') },
      { path: 'servicios', ...p(() => import('./servicios/ui/servicios').then((m) => m.ServiciosPagina), 'Servicios') },
      { path: 'acciones', ...p(() => import('./acciones/ui/acciones').then((m) => m.AccionesPagina), 'Acciones del agente') },
      { path: 'acciones/:id', ...p(() => import('./acciones/ui/acciones').then((m) => m.AccionesPagina), 'Acción del agente') },
    ],
  },
  { path: '**', redirectTo: '' },
];
