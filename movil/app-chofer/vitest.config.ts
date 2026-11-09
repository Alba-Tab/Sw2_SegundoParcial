import { defineConfig } from 'vitest/config';

// Dominio y aplicación son TypeScript puro (Clean): se prueban sin React Native ni SQLite, con puertos falsos.
export default defineConfig({ test: { include: ['src/**/*.test.ts'], environment: 'node' } });
