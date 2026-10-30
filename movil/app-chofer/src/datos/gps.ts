import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { estadoVisible } from '../dominio/viaje';
import { casos, viajes } from './contenedor';

/**
 * GPS en segundo plano (spec 005, paso 4; PoC-4): un servicio en primer plano en Android y el indicador azul en iOS.
 * La tarea se define al cargar el bundle; cada lectura pasa por el muestreo de D52 antes de guardarse.
 */
export const TAREA_GPS = 'gps-del-viaje';

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TAREA_GPS, async ({ data, error }) => {
  if (error || !data) return;
  const enRuta = viajes.todos().find((v) => estadoVisible(v) === 'EN_RUTA');
  if (!enRuta) return;
  for (const l of data.locations) {
    casos.registrarLectura(enRuta.viajeId, {
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      velocidadMs: l.coords.speed ?? -1,
      precisionMetros: l.coords.accuracy ?? null,
      en: l.timestamp,
    });
  }
});

export type EstadoGps = 'activo' | 'sin-permiso' | 'sin-permiso-fondo' | 'detenido';

export async function iniciarGps(): Promise<EstadoGps> {
  if (await Location.hasStartedLocationUpdatesAsync(TAREA_GPS)) return 'activo';
  if ((await Location.requestForegroundPermissionsAsync()).status !== 'granted') return 'sin-permiso';
  if ((await Location.requestBackgroundPermissionsAsync()).status !== 'granted') return 'sin-permiso-fondo';
  await Location.startLocationUpdatesAsync(TAREA_GPS, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10_000,
    distanceInterval: 0,
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    foregroundService: { notificationTitle: 'Viaje en curso', notificationBody: 'Registrando la posición del viaje' },
  });
  return 'activo';
}

export async function detenerGps(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(TAREA_GPS)) await Location.stopLocationUpdatesAsync(TAREA_GPS);
}

/** Una lectura al pulsar "Iniciar viaje" para la posición del inicio (si el permiso ya está). */
export async function posicionActual(): Promise<{ lat: number; lng: number } | null> {
  try {
    const l = await Location.getLastKnownPositionAsync();
    return l ? { lat: l.coords.latitude, lng: l.coords.longitude } : casos.ultimaPosicion();
  } catch {
    return casos.ultimaPosicion();
  }
}
