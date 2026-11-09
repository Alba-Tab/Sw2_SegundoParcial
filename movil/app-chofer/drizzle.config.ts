import { defineConfig } from 'drizzle-kit';

// `npx drizzle-kit generate` crea las migraciones de src/datos/esquema.ts en drizzle/ (se aplican al abrir la app).
export default defineConfig({ dialect: 'sqlite', driver: 'expo', schema: './src/datos/esquema.ts', out: './drizzle' });
