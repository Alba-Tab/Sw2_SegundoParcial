import { eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as Network from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Resumen } from '../aplicacion/motorSincronizacion';
import { SINCRONIZAR_CADA_MS } from '../dominio/gps';
import { bd } from '../datos/bd';
import { motor } from '../datos/contenedor';
import { operacionPendiente, puntoGps } from '../datos/esquema';

/**
 * Disparadores del motor (spec 005): cambio de conectividad, app al frente y cada 90 s; la tarea en segundo plano está
 * en datos/tareaFondo. Los contadores salen de SQLite en vivo: el chofer ve "Pendientes: N" sin esperar a la red.
 */
export function useSincronizacion(alCancelarse: (viajeIds: string[]) => void, alVencerSesion: () => void) {
  const [enLinea, setEnLinea] = useState(true);
  const [ultimo, setUltimo] = useState<Resumen | null>(null);
  const avisos = useRef({ alCancelarse, alVencerSesion });
  useEffect(() => {
    avisos.current = { alCancelarse, alVencerSesion };
  }, [alCancelarse, alVencerSesion]);

  const pendientes = useLiveQuery(
    bd
      .select({ n: sql<number>`count(*)` })
      .from(operacionPendiente)
      .where(eq(operacionPendiente.estado, 'PENDIENTE')),
  ).data[0]?.n;
  const conError = useLiveQuery(
    bd
      .select({ n: sql<number>`count(*)` })
      .from(operacionPendiente)
      .where(eq(operacionPendiente.estado, 'FALLIDA')),
  ).data[0]?.n;
  const puntos = useLiveQuery(bd.select({ n: sql<number>`count(*)` }).from(puntoGps)).data[0]?.n;

  // Nunca rechaza: los disparadores la llaman con `void` y un error inesperado no debe quedar sin capturar. La tanda
  // siguiente vuelve a intentar.
  const sincronizar = useCallback(async (): Promise<Resumen | null> => {
    try {
      const r = await motor.sincronizar();
      setUltimo(r);
      setEnLinea(!r.sinConexion);
      if (r.cancelados.length) avisos.current.alCancelarse(r.cancelados);
      if (r.requiereSesion) avisos.current.alVencerSesion();
      return r;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    // La limpieza del cursor nunca lanza; aun así, la sincronización inicial corre pase lo que pase.
    void motor
      .recuperarCursor()
      .catch(() => {})
      .then(sincronizar);
    const red = Network.addNetworkStateListener((e) => {
      setEnLinea(e.isConnected === true);
      if (e.isConnected) void sincronizar();
    });
    const app = AppState.addEventListener('change', (e) => e === 'active' && void sincronizar());
    const reloj = setInterval(() => void sincronizar(), SINCRONIZAR_CADA_MS);
    return () => {
      red.remove();
      app.remove();
      clearInterval(reloj);
    };
  }, [sincronizar]);

  return { enLinea, pendientes: pendientes ?? 0, conError: conError ?? 0, puntos: puntos ?? 0, ultimo, sincronizar };
}
