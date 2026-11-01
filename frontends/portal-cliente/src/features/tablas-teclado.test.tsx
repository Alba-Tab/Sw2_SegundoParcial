import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { simularApi } from '../pruebas/utilidades';
import { PaginaFacturas } from './facturas/PaginaFacturas';
import { PaginaServicios } from './servicios/PaginaServicios';

vi.mock('../compartido/sesion/ClienteActivo', () => ({ useClienteActivo: () => ({ modoComercial: false, elegir: () => {} }) }));

const SERVICIO = '0193c000-0000-7000-8000-000000000001';
const bob = (monto: string) => ({ monto, moneda: 'BOB' });

/** Con el router real: el enlace tiene href, recibe el foco con Tab y abre el detalle con Enter (V3-1, WCAG 2.1.1). */
function montar(inicial: string) {
  const raiz = createRootRoute({ component: Outlet });
  const router = createRouter({
    routeTree: raiz.addChildren([
      createRoute({ getParentRoute: () => raiz, path: '/servicios', component: PaginaServicios }),
      createRoute({ getParentRoute: () => raiz, path: '/servicios/$servicioId', component: () => <p>Detalle del servicio</p> }),
      createRoute({ getParentRoute: () => raiz, path: '/facturas', component: PaginaFacturas }),
    ]),
    history: createMemoryHistory({ initialEntries: [inicial] }),
  });
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={consultas}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** Tabula hasta el enlace (sin clics): falla si el enlace no entra en el orden del foco. */
async function tabularHasta(enlace: HTMLElement) {
  const usuario = userEvent.setup();
  for (let i = 0; i < 20 && document.activeElement !== enlace; i++) await usuario.tab();
  expect(document.activeElement).toBe(enlace);
  await usuario.keyboard('{Enter}');
}

describe('tablas del portal con teclado (V3-1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Mis servicios: la fecha del pedido es un enlace al detalle', async () => {
    simularApi({
      'GET /api/v1/rutas': { estado: 200, cuerpo: [] },
      'GET /api/v1/servicios': {
        estado: 200,
        cuerpo: {
          items: [
            {
              servicioId: SERVICIO,
              viajeId: 'v',
              clienteId: 'c',
              cotizacionId: 'k',
              canal: 'PORTAL',
              estado: 'CONFIRMADO',
              confirmacionCompleta: true,
              creadoEn: '2026-11-03T12:00:00Z',
            },
          ],
          siguienteCursor: null,
        },
      },
    });
    const router = montar('/servicios');
    const enlace = await screen.findByRole('link', { name: /2026/ });
    expect(enlace.getAttribute('href')).toBe(`/servicios/${SERVICIO}`);
    await tabularHasta(enlace);
    expect(await screen.findByText('Detalle del servicio')).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/servicios/${SERVICIO}`));
  });

  it('Facturas: «Ver servicio» lleva al servicio de la factura', async () => {
    simularApi({
      'GET /api/v1/lineas-credito/mia': {
        estado: 200,
        cuerpo: {
          clienteId: 'c',
          limite: bob('100.00'),
          reservado: bob('0.00'),
          utilizado: bob('0.00'),
          disponible: bob('100.00'),
          enMora: false,
          version: 1,
        },
      },
      'GET /api/v1/facturas': {
        estado: 200,
        cuerpo: {
          items: [
            {
              facturaId: 'f',
              numero: 'FAC-000001',
              viajeId: 'v',
              servicioId: SERVICIO,
              clienteId: 'c',
              razonSocial: 'Agroexport',
              monto: bob('10.00'),
              saldo: bob('10.00'),
              estado: 'EMITIDA',
              emitidaEl: '2026-10-01',
              venceEl: '2026-10-31',
              vencida: false,
              diasVencida: 0,
            },
          ],
          siguienteCursor: null,
        },
      },
    });
    const router = montar('/facturas');
    const enlace = await screen.findByRole('link', { name: 'Ver servicio' });
    await tabularHasta(enlace);
    expect(await screen.findByText('Detalle del servicio')).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/servicios/${SERVICIO}`);
  });
});
