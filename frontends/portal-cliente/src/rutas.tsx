import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { Marco } from './compartido/ui/Marco';
import { PaginaEmpresa } from './features/cuenta/PaginaEmpresa';
import { PaginaCotizacion } from './features/cotizar/PaginaCotizacion';
import { PaginaCotizar } from './features/cotizar/PaginaCotizar';

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

export const router = createRouter({ routeTree: raiz.addChildren([inicio, empresa, cotizar, cotizacion]) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
