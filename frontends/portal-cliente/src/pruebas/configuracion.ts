import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// Node 25 o más nuevo trae su propio localStorage (indefinido sin --localstorage-file) y tapa el de jsdom; CI corre
// Node 24, donde no pasa. Para que las pruebas den lo mismo en las dos, se usa uno en memoria si falta.
if (!window.localStorage) {
  const datos = new Map<string, string>();
  const memoria: Storage = {
    get length() {
      return datos.size;
    },
    clear: () => datos.clear(),
    getItem: (k) => datos.get(k) ?? null,
    key: (i) => [...datos.keys()][i] ?? null,
    removeItem: (k) => void datos.delete(k),
    setItem: (k, v) => void datos.set(k, String(v)),
  };
  Object.defineProperty(window, 'localStorage', { value: memoria, configurable: true });
}
