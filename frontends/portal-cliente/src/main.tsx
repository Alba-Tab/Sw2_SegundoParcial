import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { z } from 'zod';
import { ErrorApi } from './api/cliente';
import { opcionesPersistencia } from './compartido/offline/cache';
import { ProveedorClienteActivo } from './compartido/sesion/ClienteActivo';
import { ProveedorSesion } from './compartido/sesion/ProveedorSesion';
import { tema } from './compartido/tema/tema';
import { router } from './rutas';

z.config(z.locales.es());
// PWA: el service worker guarda la app para abrirla sin conexión y se actualiza solo.
registerSW({ immediate: true });

const consultas = new QueryClient({
  defaultOptions: {
    // Un 4xx no se arregla reintentando; los 5xx y la falta de red, hasta 2 veces. gcTime largo para que la caché
    // persistida (servicios, facturas, crédito) sobreviva una recarga sin conexión.
    queries: { retry: (n, e) => !(e instanceof ErrorApi && e.estado < 500) && n < 2, staleTime: 30_000, gcTime: 24 * 3600_000 },
  },
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ThemeProvider theme={tema}>
      <CssBaseline />
      <ProveedorSesion navegar={(destino) => router.history.replace(destino)}>
        <PersistQueryClientProvider client={consultas} persistOptions={opcionesPersistencia}>
          <ProveedorClienteActivo>
            <RouterProvider router={router} />
          </ProveedorClienteActivo>
        </PersistQueryClientProvider>
      </ProveedorSesion>
    </ThemeProvider>
  </StrictMode>,
);
