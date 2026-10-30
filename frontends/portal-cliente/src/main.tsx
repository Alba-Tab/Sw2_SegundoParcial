import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import { ErrorApi } from './api/cliente';
import { ProveedorSesion } from './compartido/sesion/ProveedorSesion';
import { tema } from './compartido/tema/tema';
import { router } from './rutas';

z.config(z.locales.es());

const consultas = new QueryClient({
  defaultOptions: {
    // Un 4xx no se arregla reintentando; los 5xx y la falta de red, hasta 2 veces.
    queries: { retry: (n, e) => !(e instanceof ErrorApi && e.estado < 500) && n < 2, staleTime: 30_000 },
  },
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ThemeProvider theme={tema}>
      <CssBaseline />
      <ProveedorSesion>
        <QueryClientProvider client={consultas}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ProveedorSesion>
    </ThemeProvider>
  </StrictMode>,
);
