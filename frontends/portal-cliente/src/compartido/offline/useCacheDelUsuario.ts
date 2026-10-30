import { type QueryClient, useIsRestoring } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { asegurarDueno, duenoCache, suscribirDueno } from './cache';

/**
 * La caché persistida es de un solo usuario (propuesta 6.4). Con sesión, devuelve false hasta comprobar que es de este
 * `sub` (o descartarla): mientras tanto no se monta ninguna página, así que ni un instante se ven datos de otro usuario.
 * Se comprueba cuando terminó de restaurarse lo guardado, para que la restauración no la vuelva a llenar. Sin sesión
 * (sin conexión) devuelve true: se lee lo guardado en este equipo.
 */
export function useCacheDelUsuario(consultas: QueryClient, sub: string | undefined): boolean {
  const restaurando = useIsRestoring();
  const dueno = useSyncExternalStore(suscribirDueno, duenoCache);
  useEffect(() => {
    if (sub && !restaurando && dueno !== sub) asegurarDueno(consultas, sub);
  }, [consultas, sub, restaurando, dueno]);
  return !sub || (!restaurando && dueno === sub);
}
