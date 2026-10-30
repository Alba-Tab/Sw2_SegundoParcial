import { render, waitFor } from '@testing-library/react';
import { ErrorResponse, type User } from 'oidc-client-ts';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pedirViajes } from '../../api/cliente';
import { problema, simularApi } from '../../pruebas/utilidades';
import { ProveedorSesion } from './ProveedorSesion';

const oidc = vi.hoisted(() => ({
  alVolver: undefined as ((u: User | undefined) => void) | undefined,
  renovacionFallida: undefined as ((e: unknown) => void) | undefined,
  removeUser: vi.fn(async () => {}),
  signinRedirect: vi.fn<(args?: { state?: string }) => Promise<void>>(async () => {}),
}));
vi.mock('react-oidc-context', async (original) => ({
  ...(await original<typeof import('react-oidc-context')>()),
  AuthProvider: (p: { children: ReactNode; onSigninCallback: (u: User | undefined) => void }) => {
    oidc.alVolver = p.onSigninCallback;
    return p.children;
  },
  useAuth: () => ({
    user: { access_token: 'token-vigente' },
    events: {
      addSilentRenewError: (cb: (e: unknown) => void) => {
        oidc.renovacionFallida = cb;
        return () => {};
      },
    },
    removeUser: oidc.removeUser,
    signinRedirect: oidc.signinRedirect,
  }),
}));

const navegar = vi.fn();
const montar = () => render(<ProveedorSesion navegar={navegar}>hola</ProveedorSesion>);

describe('ProveedorSesion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('al volver de Keycloak lleva a la página pedida antes de iniciar sesión (enlace del correo)', () => {
    montar();
    oidc.alVolver?.({ state: '/servicios/0193a000-0000-7000-8000-000000000123' } as User);
    expect(navegar).toHaveBeenLastCalledWith('/servicios/0193a000-0000-7000-8000-000000000123');
    oidc.alVolver?.({ state: '//otro.sitio' } as User);
    expect(navegar).toHaveBeenLastCalledWith('/');
    oidc.alVolver?.(undefined);
    expect(navegar).toHaveBeenLastCalledWith('/');
  });

  it('si Keycloak rechaza la renovación (invalid_grant), olvida el usuario y pide la sesión volviendo a la misma página', async () => {
    window.history.replaceState({}, '', '/facturas');
    montar();
    oidc.renovacionFallida?.(new ErrorResponse({ error: 'invalid_grant' }));
    await waitFor(() => expect(oidc.signinRedirect).toHaveBeenCalledWith({ state: '/facturas' }));
    expect(oidc.removeUser).toHaveBeenCalled();
  });

  it('un corte de red al renovar no saca al usuario (puede seguir viendo lo guardado)', async () => {
    montar();
    oidc.renovacionFallida?.(new TypeError('Failed to fetch'));
    await Promise.resolve();
    expect(oidc.removeUser).not.toHaveBeenCalled();
    expect(oidc.signinRedirect).not.toHaveBeenCalled();
  });

  it('un 401 de la API con token vuelve a pedir la sesión en vez de mostrar "Error 401"', async () => {
    window.history.replaceState({}, '', '/servicios');
    simularApi({ 'GET /api/v1/servicios': { estado: 401, cuerpo: problema(401, 'NO_AUTENTICADO') } });
    montar();
    await expect(pedirViajes('/api/v1/servicios')).rejects.toMatchObject({ estado: 401 });
    await waitFor(() => expect(oidc.signinRedirect).toHaveBeenCalledWith({ state: '/servicios' }));
    expect(oidc.removeUser).toHaveBeenCalled();
  });
});
