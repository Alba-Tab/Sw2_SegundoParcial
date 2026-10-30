import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { Marco } from './compartido/ui/Marco';
import { PaginaEmpresa } from './features/cuenta/PaginaEmpresa';
import { PaginaCotizacion } from './features/cotizar/PaginaCotizacion';
import { PaginaCotizar } from './features/cotizar/PaginaCotizar';
import { PaginaServicio } from './features/servicios/PaginaServicio';
import { PaginaServicios } from './features/servicios/PaginaServicios';

const raiz = createRootRoute({ component: Marco });

const inicio = createRoute({
  getParentRoute: () => raiz,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/cotizar' });
  },
});
const empresa = createRoute({ getParentRoute: () => raiz, path: '/empresa', component: PaginaEmpresa });
const cotizar = createRoute({ getParentRoute: () => raiz, path: '/cotizar', component: PaginaCotizar });
const cotizacion = createRoute({ getParentRoute: () => raiz, path: '/cotizaciones/$cotizacionId', component: PaginaCotizacion });
const servicios = createRoute({ getParentRoute: () => raiz, path: '/servicios', component: PaginaServicios });
const servicio = createRoute({ getParentRoute: () => raiz, path: '/servicios/$servicioId', component: PaginaServicio });

export const router = createRouter({ routeTree: raiz.addChildren([inicio, empresa, cotizar, cotizacion, servicios, servicio]) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
