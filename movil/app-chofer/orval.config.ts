import { defineConfig } from 'orval';

// D49: funciones fetch y tipos desde contratos/openapi. El mutator devuelve {data, status, headers} con cualquier
// estado: el motor de sincronización decide qué hacer con cada respuesta (spec 005).
const servicio = (nombre: 'viajes' | 'flota', mutator: string) => ({
  [nombre]: {
    input: { target: `../../contratos/openapi/${nombre}.yaml`, parserOptions: { externalRefs: { allow: ['./comun.yaml'] } } },
    output: {
      target: `src/datos/api/generado/${nombre}.ts`,
      client: 'fetch' as const,
      clean: false,
      override: { mutator: { path: 'src/datos/api/cliente.ts', name: mutator } },
    },
  },
});

export default defineConfig({ ...servicio('viajes', 'pedirViajes'), ...servicio('flota', 'pedirFlota') });
