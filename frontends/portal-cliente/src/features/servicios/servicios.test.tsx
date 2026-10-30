import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { conConsultas, problema, simularApi } from '../../pruebas/utilidades';
import { ConfirmarServicio } from './ConfirmarServicio';
import { PaginaServicio } from './PaginaServicio';

const navegar = vi.fn();
const SERVICIO = '0193c000-0000-7000-8000-000000000001';
const VIAJE = '0193c000-0000-7000-8000-000000000002';
const clienteActivo = vi.hoisted(() => ({ actual: { modoComercial: false, clienteId: undefined as string | undefined } }));
vi.mock('../../compartido/sesion/ClienteActivo', () => ({ useClienteActivo: () => ({ ...clienteActivo.actual, elegir: () => {} }) }));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navegar,
  useParams: () => ({ servicioId: SERVICIO }),
  createLink: (c: unknown) => c,
}));

const base = {
  servicioId: SERVICIO,
  viajeId: VIAJE,
  clienteId: 'c',
  cotizacionId: 'k',
  canal: 'PORTAL',
  confirmacionCompleta: false,
  creadoEn: '2026-11-03T12:00:00Z',
  tipoCarga: 'GRANOS',
  toneladas: 20,
};
const rutas = { 'GET /api/v1/rutas': { estado: 200, cuerpo: [] } };

describe('Confirmar y seguir (specs 003, 004 y 006)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('FS7: un corte de red se reintenta con la misma clave; otro intento usa otra', async () => {
    const llamadas = simularApi({
      'POST /api/v1/servicios': [
        { estado: 0, sinRed: true },
        { estado: 202, cuerpo: { servicioId: SERVICIO, viajeId: VIAJE, estado: 'PROGRAMANDO' } },
      ],
    });
    conConsultas(<ConfirmarServicio cotizacionId="k" />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar servicio' }));
    await waitFor(() => expect(navegar).toHaveBeenCalledWith({ to: '/servicios/$servicioId', params: { servicioId: SERVICIO } }), {
      timeout: 4000,
    });
    const [a, b] = llamadas.filter((l) => l.metodo === 'POST');
    expect(a.encabezados.get('Idempotency-Key')).toBe(b.encabezados.get('Idempotency-Key'));
    expect(b.cuerpo).toEqual({ cotizacionId: 'k' });
  });

  it('muestra "En aprobación" mientras la saga espera la decisión de crédito', async () => {
    simularApi({
      ...rutas,
      [`GET /api/v1/servicios/${SERVICIO}`]: { estado: 200, cuerpo: { ...base, estado: 'PROGRAMANDO', etapa: 'ESPERANDO_APROBACION' } },
    });
    conConsultas(<PaginaServicio />);
    expect(await screen.findByText('En aprobación')).toBeTruthy();
    expect(screen.getByText(/administración está revisando tu crédito/)).toBeTruthy();
  });

  it('FS2: cancelado por crédito insuficiente, con el motivo en palabras del cliente', async () => {
    simularApi({
      ...rutas,
      [`GET /api/v1/servicios/${SERVICIO}`]: { estado: 200, cuerpo: { ...base, estado: 'CANCELADO', motivo: 'CREDITO_INSUFICIENTE' } },
    });
    conConsultas(<PaginaServicio />);
    expect(await screen.findByText('Tu crédito disponible no alcanza para este servicio.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancelar servicio' })).toBeNull();
  });

  it('cancelar mientras se confirma: 409 CONFIRMACION_EN_CURSO con su mensaje', async () => {
    const llamadas = simularApi({
      ...rutas,
      [`GET /api/v1/servicios/${SERVICIO}`]: { estado: 200, cuerpo: { ...base, estado: 'PROGRAMANDO', etapa: 'RESERVANDO_UNIDAD' } },
      [`POST /api/v1/servicios/${SERVICIO}/cancelacion`]: { estado: 409, cuerpo: problema(409, 'CONFIRMACION_EN_CURSO') },
    });
    conConsultas(<PaginaServicio />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar servicio' }));
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Ya no necesito el envío' } });
    const confirmar = screen.getAllByRole('button', { name: 'Cancelar servicio' }).at(-1)!;
    fireEvent.click(confirmar);
    expect(await screen.findByText(/todavía se está confirmando/)).toBeTruthy();
    const c = llamadas.find((l) => l.url.endsWith('/cancelacion'))!;
    expect(c.cuerpo).toEqual({ motivo: 'Ya no necesito el envío' });
    expect(c.encabezados.get('Idempotency-Key')).toBeTruthy();
  });

  it('cerrado: la factura y el POD con las URL firmadas de la foto y la firma', async () => {
    simularApi({
      ...rutas,
      [`GET /api/v1/servicios/${SERVICIO}`]: {
        estado: 200,
        cuerpo: { ...base, estado: 'CERRADO', numeroFactura: 'FAC-000123', entregadoEn: '2026-11-03T18:00:00Z' },
      },
      [`GET /api/v1/viajes/${VIAJE}/entrega`]: {
        estado: 200,
        cuerpo: {
          entregaId: 'e',
          viajeId: VIAJE,
          tipo: 'ENTREGA',
          registradaEn: '2026-11-03T18:00:00Z',
          posicion: { lat: -17.77, lng: -63.19 },
          distanciaMetros: 40,
          dentroGeocerca: true,
          conFirma: true,
          nombreReceptor: 'María Rojas',
          fotos: ['f1'],
          firmaEvidenciaId: 'f2',
        },
      },
      [`GET /api/v1/viajes/${VIAJE}/evidencias/f1`]: {
        estado: 200,
        cuerpo: {
          evidenciaId: 'f1',
          viajeId: VIAJE,
          tipo: 'FOTO_ENTREGA',
          estado: 'COMPLETA',
          contentType: 'image/jpeg',
          tamanoBytes: 1,
          url: 'https://s3/f1',
        },
      },
      [`GET /api/v1/viajes/${VIAJE}/evidencias/f2`]: {
        estado: 200,
        cuerpo: {
          evidenciaId: 'f2',
          viajeId: VIAJE,
          tipo: 'FIRMA',
          estado: 'COMPLETA',
          contentType: 'image/png',
          tamanoBytes: 1,
          url: 'https://s3/f2',
        },
      },
    });
    conConsultas(<PaginaServicio />);
    expect(await screen.findByText('Factura FAC-000123')).toBeTruthy();
    expect(await screen.findByText(/Recibió María Rojas/)).toBeTruthy();
    expect(((await screen.findByAltText('Firma del receptor')) as HTMLImageElement).src).toBe('https://s3/f2');
    expect(((await screen.findByAltText('Foto de la entrega 1')) as HTMLImageElement).src).toBe('https://s3/f1');
  });
});
