import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { conConsultas, problema, simularApi } from '../../pruebas/utilidades';
import { PaginaFacturas } from './PaginaFacturas';

const clienteActivo = vi.hoisted(() => ({ actual: { modoComercial: false, clienteId: undefined as string | undefined } }));
vi.mock('../../compartido/sesion/ClienteActivo', () => ({ useClienteActivo: () => ({ ...clienteActivo.actual, elegir: () => {} }) }));
const ruta = vi.hoisted(() => ({ params: {} as { facturaId?: string } }));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ruta.params,
  createLink:
    (C: ComponentType<{ href: string; children?: ReactNode }>) =>
    ({ to, children }: { to: string; children?: ReactNode }) => <C href={to}>{children}</C>,
}));

const bob = (monto: string) => ({ monto, moneda: 'BOB' });
const factura = (numero: string, monto: string, saldo: string, venceEl: string, extra: object = {}) => ({
  facturaId: numero,
  numero,
  viajeId: 'v',
  servicioId: 's',
  clienteId: 'c',
  razonSocial: 'Agroexport',
  monto: bob(monto),
  saldo: bob(saldo),
  estado: saldo === '0.00' ? 'PAGADA' : 'EMITIDA',
  emitidaEl: '2026-10-01',
  venceEl,
  vencida: false,
  diasVencida: 0,
  ...extra,
});
const linea = {
  clienteId: 'c',
  limite: bob('30000.00'),
  reservado: bob('2800.00'),
  utilizado: bob('10640.00'),
  disponible: bob('16560.00'),
  enMora: false,
  version: 3,
};

describe('Facturas y crédito (specs 006 y 008)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('muestra el crédito y las facturas ordenadas por vencimiento; ordena por monto y filtra con saldo', async () => {
    const llamadas = simularApi({
      'GET /api/v1/lineas-credito/mia': { estado: 200, cuerpo: linea },
      'GET /api/v1/facturas': {
        estado: 200,
        cuerpo: {
          items: [
            factura('FAC-000002', '2800.00', '2800.00', '2026-11-30'),
            factura('FAC-000001', '10640.00', '0.00', '2026-10-31'),
            factura('FAC-000003', '7600.00', '7600.00', '2026-10-20', { vencida: true, diasVencida: 10 }),
          ],
          siguienteCursor: null,
        },
      },
    });
    conConsultas(<PaginaFacturas />);
    expect(await screen.findByText(/disponible de/)).toBeTruthy();
    const filas = async () => (await screen.findAllByRole('row')).slice(1).map((f) => within(f).getAllByRole('cell')[0].textContent);
    expect(await filas()).toEqual(['FAC-000003', 'FAC-000001', 'FAC-000002']);
    expect(screen.getByText('10 días vencida')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Monto' }));
    expect(await filas()).toEqual(['FAC-000002', 'FAC-000003', 'FAC-000001']);

    fireEvent.click(screen.getByLabelText('Solo con saldo'));
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/v1/facturas' && l.metodo === 'GET' && llamadas.length > 2)).toBe(true));
  });

  it('/facturas/$facturaId: resalta esa factura y le pone el foco (N6)', async () => {
    ruta.params = { facturaId: 'FAC-000001' };
    simularApi({
      'GET /api/v1/lineas-credito/mia': { estado: 200, cuerpo: linea },
      'GET /api/v1/facturas': {
        estado: 200,
        cuerpo: {
          items: [factura('FAC-000002', '2800.00', '2800.00', '2026-11-30'), factura('FAC-000001', '10640.00', '0.00', '2026-10-31')],
          siguienteCursor: null,
        },
      },
    });
    conConsultas(<PaginaFacturas />);
    const fila = (await screen.findByText('FAC-000001')).closest('tr')!;
    expect(fila.getAttribute('aria-current')).toBe('true');
    expect(fila.classList.contains('Mui-selected')).toBe(true);
    expect(document.activeElement).toBe(fila);
    expect(screen.getByText('FAC-000002').closest('tr')!.getAttribute('aria-current')).toBeNull();
    ruta.params = {};
  });

  it('/facturas/$facturaId en una página que no se cargó: la pide sola y la resalta (B-3)', async () => {
    ruta.params = { facturaId: 'FAC-000009' };
    simularApi({
      'GET /api/v1/lineas-credito/mia': { estado: 200, cuerpo: linea },
      'GET /api/v1/facturas': [
        { estado: 200, cuerpo: { items: [factura('FAC-000002', '2800.00', '2800.00', '2026-11-30')], siguienteCursor: 'c2' } },
        { estado: 200, cuerpo: { items: [factura('FAC-000009', '100.00', '100.00', '2026-12-31')], siguienteCursor: null } },
      ],
    });
    conConsultas(<PaginaFacturas />);
    const fila = (await screen.findByText('FAC-000009')).closest('tr')!;
    expect(fila.getAttribute('aria-current')).toBe('true');
    expect(screen.queryByText(/No encontramos la factura/)).toBeNull();
    ruta.params = {};
  });

  it('si falla la página siguiente al buscar la factura del enlace, no insiste y ofrece reintentar (V1-2)', async () => {
    ruta.params = { facturaId: 'FAC-000009' };
    const llamadas = simularApi({
      'GET /api/v1/lineas-credito/mia': { estado: 200, cuerpo: linea },
      'GET /api/v1/facturas': [
        { estado: 200, cuerpo: { items: [factura('FAC-000002', '2800.00', '2800.00', '2026-11-30')], siguienteCursor: 'c2' } },
        { estado: 500, cuerpo: problema(500, 'ERROR_INTERNO') },
        { estado: 200, cuerpo: { items: [factura('FAC-000009', '100.00', '100.00', '2026-12-31')], siguienteCursor: null } },
      ],
    });
    conConsultas(<PaginaFacturas />);
    const reintentar = await screen.findByRole('button', { name: /Reintentar/ });
    await new Promise((r) => setTimeout(r, 50));
    expect(llamadas.filter((l) => l.url === '/api/v1/facturas').length).toBe(2);
    expect(screen.queryByRole('button', { name: 'Ver más' })).toBeNull();
    fireEvent.click(reintentar);
    expect(await screen.findByText('FAC-000009')).toBeTruthy();
    ruta.params = {};
  });

  it('modo comercial: pide las facturas y la línea del cliente que atiende', async () => {
    clienteActivo.actual = { modoComercial: true, clienteId: 'c1' };
    const pedidas: string[] = [];
    simularApi({
      'GET /api/v1/lineas-credito/c1': { estado: 200, cuerpo: linea },
      'GET /api/v1/facturas': { estado: 200, cuerpo: { items: [], siguienteCursor: null } },
    });
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', (u: string, i?: RequestInit) => {
      pedidas.push(u);
      return original(u, i);
    });
    conConsultas(<PaginaFacturas />);
    expect(await screen.findByText('No hay facturas.')).toBeTruthy();
    expect(pedidas.some((u) => u.endsWith('/api/v1/facturas?clienteId=c1'))).toBe(true);
    expect(pedidas.some((u) => u.endsWith('/api/v1/lineas-credito/c1'))).toBe(true);
    clienteActivo.actual = { modoComercial: false, clienteId: undefined };
  });
});
