import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { hasAuthParams } from 'react-oidc-context';
import { Marco } from './compartido/ui/Marco';
import { PaginaClientes } from './features/comercial/PaginaClientes';
import { PaginaEmpresa } from './features/cuenta/PaginaEmpresa';
import { PaginaCotizacion } from './features/cotizar/PaginaCotizacion';
import { PaginaCotizar } from './features/cotizar/PaginaCotizar';
import { PaginaFacturas } from './features/facturas/PaginaFacturas';
import { PaginaServicio } from './features/servicios/PaginaServicio';
import { PaginaServicios } from './features/servicios/PaginaServicios';

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
const empresa = createRoute({ getParentRoute: () => raiz, path: '/empresa', component: PaginaEmpresa });
const cotizar = createRoute({ getParentRoute: () => raiz, path: '/cotizar', component: PaginaCotizar });
const cotizacion = createRoute({ getParentRoute: () => raiz, path: '/cotizaciones/$cotizacionId', component: PaginaCotizacion });
const servicios = createRoute({ getParentRoute: () => raiz, path: '/servicios', component: PaginaServicios });
const facturas = createRoute({ getParentRoute: () => raiz, path: '/facturas', component: PaginaFacturas });
// El correo de FacturaEmitida enlaza a /facturas/{facturaId} (spec 006, paso 6): llega a la lista de facturas.
const factura = createRoute({ getParentRoute: () => raiz, path: '/facturas/$facturaId', component: PaginaFacturas });
const clientes = createRoute({ getParentRoute: () => raiz, path: '/clientes', component: PaginaClientes });
const servicio = createRoute({ getParentRoute: () => raiz, path: '/servicios/$servicioId', component: PaginaServicio });

export const router = createRouter({
  routeTree: raiz.addChildren([inicio, empresa, cotizar, cotizacion, servicios, servicio, facturas, factura, clientes]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
