import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { conConsultas, problema, simularApi } from '../../pruebas/utilidades';
import { PaginaCotizar } from './PaginaCotizar';

const navegar = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navegar }));

const AULA = '01933a00-0000-7000-8000-000000000004';
const rutas = [
  {
    rutaId: AULA,
    nombre: 'Santa Cruz – Aula',
    origen: { nombre: 'Santa Cruz', coordenadas: { lat: -17.78, lng: -63.18 } },
    destino: { nombre: 'Aula', coordenadas: { lat: -17.77, lng: -63.19 }, radioMetros: 300 },
    distanciaKm: 120,
    activa: true,
  },
];

describe('Cotizar (spec 002)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reintenta solo con la misma clave mientras el cliente no llegó a Finanzas (503) y abre la cotización', async () => {
    const cotizacion = { cotizacionId: '0193b000-0000-7000-8000-000000000001' };
    const llamadas = simularApi({
      'GET /api/v1/rutas': { estado: 200, cuerpo: rutas },
      'POST /api/v1/cotizaciones': [
        { estado: 503, cuerpo: problema(503, 'CLIENTE_NO_REPLICADO'), encabezados: { 'Retry-After': '1' } },
        { estado: 201, cuerpo: cotizacion },
      ],
    });
    conConsultas(<PaginaCotizar />);

    const ruta = await screen.findByRole('combobox', { name: /Ruta/ });
    await waitFor(() => expect(ruta.getAttribute('aria-disabled')).toBeNull());
    fireEvent.mouseDown(ruta);
    fireEvent.click(within(await screen.findByRole('listbox')).getByText(/Santa Cruz – Aula/));
    fireEvent.change(screen.getByLabelText(/Toneladas/), { target: { value: '28' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cotizar' }));

    await waitFor(
      () => expect(navegar).toHaveBeenCalledWith({ to: '/cotizaciones/$cotizacionId', params: { cotizacionId: cotizacion.cotizacionId } }),
      { timeout: 4000 },
    );
    const envios = llamadas.filter((l) => l.metodo === 'POST');
    expect(envios).toHaveLength(2);
    expect(envios[0].encabezados.get('Idempotency-Key')).toBe(envios[1].encabezados.get('Idempotency-Key'));
    expect(envios[0].cuerpo).toMatchObject({ rutaId: AULA, tipoCarga: 'GRANOS', toneladas: 28 });
  });

  it('avisa más de 30 toneladas sin llamar a Finanzas', async () => {
    const llamadas = simularApi({ 'GET /api/v1/rutas': { estado: 200, cuerpo: rutas } });
    conConsultas(<PaginaCotizar />);
    await screen.findByRole('combobox', { name: /Ruta/ });
    fireEvent.change(screen.getByLabelText(/Toneladas/), { target: { value: '31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cotizar' }));
    expect(await screen.findByText('El máximo por servicio es 30 toneladas')).toBeTruthy();
    expect(llamadas.some((l) => l.metodo === 'POST')).toBe(false);
  });
});
