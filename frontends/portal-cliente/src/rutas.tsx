import { createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect } from '@tanstack/react-router';
import { hasAuthParams } from 'react-oidc-context';
import { Marco } from './compartido/ui/Marco';

const raiz = createRootRoute({ component: Marco });

const inicio = createRoute({
  getParentRoute: () => raiz,
  path: '/',
  beforeLoad: () => {
    // La vuelta de Keycloak llega aquí con ?code=…&state=…: se queda hasta que la sesión la procese y lleve a la página
    // pedida (ProveedorSesion). Redirigir antes borraría el código.
    if (hasAuthParams()) return;
    throw redirect({ to: '/cotizar' });
  },
});

// Cada página en su propio archivo JS: la primera carga solo baja el marco (MUI, sesión y router).
const pagina = lazyRouteComponent;

const empresa = createRoute({
  getParentRoute: () => raiz,
  path: '/empresa',
  component: pagina(() => import('./features/cuenta/PaginaEmpresa'), 'PaginaEmpresa'),
});
const cotizar = createRoute({
  getParentRoute: () => raiz,
  path: '/cotizar',
  component: pagina(() => import('./features/cotizar/PaginaCotizar'), 'PaginaCotizar'),
});
const cotizacion = createRoute({
  getParentRoute: () => raiz,
  path: '/cotizaciones/$cotizacionId',
  component: pagina(() => import('./features/cotizar/PaginaCotizacion'), 'PaginaCotizacion'),
});
const servicios = createRoute({
  getParentRoute: () => raiz,
  path: '/servicios',
  component: pagina(() => import('./features/servicios/PaginaServicios'), 'PaginaServicios'),
});
const servicio = createRoute({
  getParentRoute: () => raiz,
  path: '/servicios/$servicioId',
  component: pagina(() => import('./features/servicios/PaginaServicio'), 'PaginaServicio'),
});
const paginaFacturas = pagina(() => import('./features/facturas/PaginaFacturas'), 'PaginaFacturas');
const facturas = createRoute({ getParentRoute: () => raiz, path: '/facturas', component: paginaFacturas });
// El correo de FacturaEmitida enlaza a /facturas/{facturaId} (spec 006, paso 6): llega a la lista de facturas.
const factura = createRoute({ getParentRoute: () => raiz, path: '/facturas/$facturaId', component: paginaFacturas });
const clientes = createRoute({
  getParentRoute: () => raiz,
  path: '/clientes',
  component: pagina(() => import('./features/comercial/PaginaClientes'), 'PaginaClientes'),
});

export const router = createRouter({
  routeTree: raiz.addChildren([inicio, empresa, cotizar, cotizacion, servicios, servicio, facturas, factura, clientes]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
