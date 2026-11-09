import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { configuracion } from '../../configuracion';
import { CuentaInterna } from './CuentaInterna';

vi.mock('../sesion/useSesion', () => ({ useSesion: () => ({ nombre: 'Gerente', cerrar: vi.fn() }) }));

describe('cuenta interna en el portal (R2F-13)', () => {
  it('lleva al Centro de Control y deja «Cerrar sesión» como salida secundaria', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CuentaInterna />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('link', { name: 'Ir al Centro de Control' }).getAttribute('href')).toBe(configuracion.centroUrl);
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
  });
});
