import { DeviceMotion } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { DetectorFrenadas } from '../dominio/frenada';
import { casos } from '../datos/contenedor';
import { detenerGps, type EstadoGps, iniciarGps } from '../datos/gps';

const GRAVEDAD = 9.81;

/**
 * Con un viaje en ruta: GPS en segundo plano y, con la app al frente, el acelerómetro a 10 Hz para las frenadas (D59).
 * La aceleración del usuario (sin gravedad) se toma como desaceleración: el celular puede ir en cualquier posición.
 */
export function useViajeEnRuta(viajeId: string | null, alFrenar: () => void) {
  const [gps, setGps] = useState<EstadoGps>('detenido');

  useEffect(() => {
    if (!viajeId) {
      void detenerGps().then(() => setGps('detenido'));
      return;
    }
    void iniciarGps().then(setGps);
    const detector = new DetectorFrenadas();
    DeviceMotion.setUpdateInterval(100);
    const sub = DeviceMotion.addListener((m) => {
      const a = m.acceleration;
      if (!a) return;
      const g = Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2) / GRAVEDAD;
      const magnitud = detector.muestra(Date.now(), g, casos.velocidadKmh());
      if (magnitud !== null && casos.registrarFrenada(viajeId, magnitud)) alFrenar();
    });
    return () => sub.remove();
  }, [viajeId, alFrenar]);

  return gps;
}
