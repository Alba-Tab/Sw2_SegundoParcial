import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoEncontrada } from './NoEncontrada';

describe('ruta desconocida (N4)', () => {
  it('muestra la página propia con enlace al inicio, sin redirigir', async () => {
    const raiz = createRootRoute({ component: Outlet, notFoundComponent: NoEncontrada });
    const inicio = createRoute({ getParentRoute: () => raiz, path: '/', component: () => <p>Inicio</p> });
    const router = createRouter({
      routeTree: raiz.addChildren([inicio]),
      history: createMemoryHistory({ initialEntries: ['/no/existe'] }),
    });
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'No encontramos esta página' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir al inicio' }).getAttribute('href')).toBe('/');
    expect(router.state.location.pathname).toBe('/no/existe');
  });
});
