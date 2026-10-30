/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    // React Compiler (memoización automática, plan §15.2) por Babel.
    react({ babel: { plugins: ['babel-plugin-react-compiler'] } }),
    // PWA (propuesta 6.4): la app abre sin conexión; los datos de lectura los guarda TanStack Query (compartido/offline).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icono.svg'],
      manifest: {
        name: 'Portal del cliente · Transporte de carga',
        short_name: 'Transporte',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        theme_color: '#3c6090',
        background_color: '#f9f9ff',
        icons: [{ src: 'icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'], navigateFallback: '/index.html' },
    }),
  ],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], setupFiles: ['src/pruebas/configuracion.ts'] },
});
