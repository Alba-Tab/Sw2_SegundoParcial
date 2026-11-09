import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conConsultas, problema, simularApi } from '../../pruebas/utilidades';
import { PaginaEmpresa } from './PaginaEmpresa';

const renovar = vi.fn(async () => {});
const navegar = vi.fn();
vi.mock('../../compartido/sesion/useSesion', () => ({
  useSesion: () => ({ necesitaEmpresa: true, renovar, iniciar: vi.fn() }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navegar }));

const cliente = {
  clienteId: '0193a000-0000-7000-8000-0000000c0009',
  razonSocial: 'Soya del Oriente S.R.L.',
  nit: '1020304050',
  correo: 'facturas@soya.bo',
  telefono: '33445566',
  direccion: 'Parque Industrial, Santa Cruz',
  canal: 'PORTAL',
  tieneCuenta: true,
  creadoEn: '2026-11-03T12:00:00Z',
};

const escribir = (etiqueta: RegExp, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

describe('Mi empresa (spec 001)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('sin cliente pide los datos, crea con Idempotency-Key, reintenta la vinculación y renueva el token', async () => {
    const llamadas = simularApi({
      'GET /api/v1/clientes/mio': { estado: 404, cuerpo: problema(404, 'NO_ENCONTRADO') },
      'POST /api/v1/clientes': { estado: 201, cuerpo: { ...cliente, vinculado: false } },
      'POST /api/v1/clientes/mio/vinculacion': { estado: 200, cuerpo: { ...cliente, vinculado: true } },
    });
    conConsultas(<PaginaEmpresa />);

    expect(await screen.findByText('Completa los datos de tu empresa')).toBeTruthy();
    escribir(/Razón social/, cliente.razonSocial);
    escribir(/NIT/, cliente.nit);
    escribir(/Correo de facturación/, cliente.correo);
    escribir(/Teléfono/, cliente.telefono);
    escribir(/Dirección/, cliente.direccion);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/todavía no pudimos activar tu cuenta/)).toBeTruthy();
    const alta = llamadas.find((l) => l.metodo === 'POST' && l.url === '/api/v1/clientes')!;
    expect(alta.encabezados.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(alta.cuerpo).toEqual({
      razonSocial: cliente.razonSocial,
      nit: cliente.nit,
      correo: cliente.correo,
      telefono: cliente.telefono,
      direccion: cliente.direccion,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar vinculación' }));
    await waitFor(() => expect(renovar).toHaveBeenCalled());
    await waitFor(() => expect(navegar).toHaveBeenCalledWith({ to: '/cotizar' }));
  });

  it('marca bajo cada campo los errores del 400 y no envía un NIT mal formado', async () => {
    const llamadas = simularApi({
      'GET /api/v1/clientes/mio': { estado: 404, cuerpo: problema(404, 'NO_ENCONTRADO') },
      'POST /api/v1/clientes': {
        estado: 400,
        cuerpo: problema(400, 'VALIDACION', { errores: [{ campo: 'correo', mensaje: 'Ya lo usa otro cliente' }] }),
      },
    });
    conConsultas(<PaginaEmpresa />);
    await screen.findByText('Completa los datos de tu empresa');
    escribir(/Razón social/, cliente.razonSocial);
    escribir(/NIT/, '12');
    escribir(/Correo de facturación/, cliente.correo);
    escribir(/Teléfono/, cliente.telefono);
    escribir(/Dirección/, cliente.direccion);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.getByLabelText(/NIT/).getAttribute('aria-invalid')).toBe('true'));
    expect(llamadas.some((l) => l.metodo === 'POST')).toBe(false);

    escribir(/NIT/, cliente.nit);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Ya lo usa otro cliente')).toBeTruthy();
  });
});
