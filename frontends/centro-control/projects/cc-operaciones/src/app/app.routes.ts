import type { Routes } from '@angular/router';
import { NoEncontrada, SinAcceso, soloInternos, soloRoles } from 'ui-comun';
import { ROLES_ACCIONES, Seccion } from './seccion';

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
      // `viajes/mapa` va antes que `viajes/:id`; los ids de viaje son UUID y Analítica los enlaza así (FL-3).
      { path: 'viajes/mapa', ...p(() => import('./viajes/ui/mapa').then((m) => m.MapaPagina), 'Mapa en vivo') },
      { path: 'viajes/:id', ...p(() => import('./viajes/ui/viaje').then((m) => m.ViajePagina), 'Viaje') },
      { path: 'decisiones', pathMatch: 'full', redirectTo: 'decisiones/entregas-observadas' },
      {
        path: 'decisiones/entregas-observadas',
        ...p(() => import('./viajes/ui/entregas').then((m) => m.EntregasPagina), 'Entregas observadas'),
      },
      {
        path: 'decisiones/intervenciones',
        ...p(() => import('./viajes/ui/intervenciones').then((m) => m.IntervencionesPagina), 'Intervenciones'),
      },
      // Rutas de antes de agrupar las pestañas (FL-3): los enlaces guardados siguen llegando, con su ?viaje= o filtro.
      { path: 'mapa', redirectTo: 'viajes/mapa' },
      { path: 'entregas-observadas', redirectTo: 'decisiones/entregas-observadas' },
      { path: 'intervenciones', redirectTo: 'decisiones/intervenciones' },
      { path: 'clientes', ...p(() => import('./clientes/ui/clientes').then((m) => m.ClientesPagina), 'Clientes') },
      { path: 'clientes/:id', ...p(() => import('./clientes/ui/cliente').then((m) => m.ClientePagina), 'Cliente') },
      { path: 'rutas', ...p(() => import('./rutas/ui/rutas').then((m) => m.RutasPagina), 'Rutas') },
      { path: 'rutas/:id', ...p(() => import('./rutas/ui/ruta').then((m) => m.RutaPagina), 'Ruta') },
      { path: 'servicios', ...p(() => import('./servicios/ui/servicios').then((m) => m.ServiciosPagina), 'Servicios') },
      {
        path: 'acciones',
        canActivate: [soloRoles(...ROLES_ACCIONES)],
        ...p(() => import('./acciones/ui/acciones').then((m) => m.AccionesPagina), 'Acciones del agente'),
      },
      {
        path: 'acciones/:id',
        canActivate: [soloRoles(...ROLES_ACCIONES)],
        ...p(() => import('./acciones/ui/acciones').then((m) => m.AccionesPagina), 'Acción propuesta'),
      },
    ],
  },
  { path: '**', component: NoEncontrada, title: 'Página no encontrada' },
];
