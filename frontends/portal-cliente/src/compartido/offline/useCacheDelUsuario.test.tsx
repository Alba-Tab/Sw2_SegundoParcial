import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { asegurarDueno } from './cache';
import { useCacheDelUsuario } from './useCacheDelUsuario';

const CLAVE_SERVICIOS = ['/api/v1/servicios'];

/** Un navegador donde ya entró `dueno` y dejó sus servicios en la caché. */
function preparar(dueno: string) {
  const consultas = new QueryClient();
  asegurarDueno(consultas, dueno);
  consultas.setQueryData(CLAVE_SERVICIOS, { items: [{ servicioId: `s-de-${dueno}` }] });
  const envoltura = ({ children }: { children: ReactNode }) => <QueryClientProvider client={consultas}>{children}</QueryClientProvider>;
  return { consultas, envoltura };
}

describe('useCacheDelUsuario', () => {
  it('con otro usuario, no deja montar las páginas hasta descartar la caché guardada', () => {
    const { consultas, envoltura } = preparar('usuario-a');
    const vistos: boolean[] = [];
    const { result } = renderHook(
      () => {
        const listo = useCacheDelUsuario(consultas, 'usuario-b');
        vistos.push(listo);
        return listo;
      },
      { wrapper: envoltura },
    );
    expect(vistos[0]).toBe(false);
    expect(result.current).toBe(true);
    expect(consultas.getQueryData(CLAVE_SERVICIOS)).toBeUndefined();
    expect(window.localStorage.getItem('portal-cache-dueno')).toBe('usuario-b');
  });

  it('con el mismo usuario conserva lo guardado y no espera', () => {
    const { consultas, envoltura } = preparar('usuario-a');
    const vistos: boolean[] = [];
    renderHook(() => vistos.push(useCacheDelUsuario(consultas, 'usuario-a')), { wrapper: envoltura });
    expect(vistos.every(Boolean)).toBe(true);
    expect(consultas.getQueryData(CLAVE_SERVICIOS)).toEqual({ items: [{ servicioId: 's-de-usuario-a' }] });
  });

  it('sin sesión (sin conexión) se lee lo guardado en el equipo', () => {
    const { consultas, envoltura } = preparar('usuario-a');
    const { result } = renderHook(() => useCacheDelUsuario(consultas, undefined), { wrapper: envoltura });
    expect(result.current).toBe(true);
    expect(consultas.getQueryData(CLAVE_SERVICIOS)).toBeDefined();
  });
});
