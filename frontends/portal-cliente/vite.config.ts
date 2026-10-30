/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// React Compiler (memoización automática, plan §15.2) por Babel.
export default defineConfig({
  plugins: [react({ babel: { plugins: ['babel-plugin-react-compiler'] } })],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
