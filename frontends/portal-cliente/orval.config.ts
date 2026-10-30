import { defineConfig } from 'orval';

// D49: hooks de TanStack Query y esquemas zod desde contratos/openapi. `npm run generar:contratos`.
const servicio = (nombre: 'viajes' | 'finanzas') => ({
  [`${nombre}`]: {
    input: { target: `../../contratos/openapi/${nombre}.yaml`, parserOptions: { externalRefs: { allow: ['./comun.yaml'] } } },
    output: {
      target: `src/api/generado/${nombre}.ts`,
      client: 'react-query' as const,
      httpClient: 'fetch' as const,
      clean: false,
      override: {
        mutator: { path: 'src/api/cliente.ts', name: nombre === 'viajes' ? 'pedirViajes' : 'pedirFinanzas' },
        query: { useQuery: true, signal: true },
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
  [`${nombre}Zod`]: {
    input: { target: `../../contratos/openapi/${nombre}.yaml`, parserOptions: { externalRefs: { allow: ['./comun.yaml'] } } },
    output: { target: `src/api/generado/${nombre}.zod.ts`, client: 'zod' as const, clean: false },
  },
});

export default defineConfig({ ...servicio('viajes'), ...servicio('finanzas') });
