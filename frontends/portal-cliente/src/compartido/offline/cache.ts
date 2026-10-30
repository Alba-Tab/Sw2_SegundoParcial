import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { Query, QueryClient } from '@tanstack/react-query';

/** Solo lecturas que el cliente consulta sin conexión (propuesta 6.4 y 6.6): servicios, facturas, crédito y rutas. */
const PREFIJOS = ['/api/v1/servicios', '/api/v1/facturas', '/api/v1/lineas-credito', '/api/v1/rutas'];
const DUENO = 'portal-cache-dueno';

const almacen = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();

export const persistidor = createSyncStoragePersister({ storage: almacen, key: 'portal-cache' });

export const opcionesPersistencia = {
  persister: persistidor,
  maxAge: 7 * 24 * 3600_000,
  dehydrateOptions: {
    shouldDehydrateQuery: (q: Query) =>
      q.state.status === 'success' && typeof q.queryKey[0] === 'string' && PREFIJOS.some((p) => (q.queryKey[0] as string).startsWith(p)),
  },
};

/** Borra la caché de esta pestaña y la guardada (al cerrar sesión). */
export function limpiarCache(consultas: QueryClient) {
  consultas.clear();
  void persistidor.removeClient();
  try {
    almacen?.removeItem(DUENO);
  } catch {
    // Sin almacenamiento: no queda nada guardado.
  }
}

/** La caché guardada es de un solo usuario: si entra otro en el mismo navegador, se descarta. */
export function asegurarDueno(consultas: QueryClient, sub: string) {
  try {
    const dueno = almacen?.getItem(DUENO);
    if (dueno && dueno !== sub) limpiarCache(consultas);
    almacen?.setItem(DUENO, sub);
  } catch {
    // Sin almacenamiento no hay caché persistida que proteger.
  }
}
