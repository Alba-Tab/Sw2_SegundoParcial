// Tarea de GPS en segundo plano: se define al cargar el bundle (antes de registrar la app) y guarda cada punto en SQLite.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { db } from './db';

export const TAREA_GPS = 'poc-gps';

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TAREA_GPS, async ({ data, error }) => {
  if (error || !data) return;
  for (const l of data.locations) {
    db.runSync('INSERT INTO puntos_gps (lat, lng, precision, registrado_en, app_estado) VALUES (?, ?, ?, ?, ?)',
      l.coords.latitude, l.coords.longitude, l.coords.accuracy ?? null, new Date(l.timestamp).toISOString(), AppState.currentState);
  }
});

export async function iniciarGps(): Promise<string> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'sin permiso de ubicación';
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return 'sin permiso "Siempre" (segundo plano)';
  await Location.startLocationUpdatesAsync(TAREA_GPS, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10000,
    distanceInterval: 0,
    deferredUpdatesInterval: 10000,
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    foregroundService: { notificationTitle: 'Viaje en curso', notificationBody: 'Registrando la posición del viaje' },
  });
  return 'registrando cada 10 s';
}

export async function detenerGps() {
  if (await Location.hasStartedLocationUpdatesAsync(TAREA_GPS)) await Location.stopLocationUpdatesAsync(TAREA_GPS);
}

export function resumenGps() {
  const r = db.getFirstSync<{ n: number; fondo: number; primero: string; ultimo: string }>(
    "SELECT count(*) n, sum(app_estado <> 'active') fondo, min(registrado_en) primero, max(registrado_en) ultimo FROM puntos_gps");
  return r ?? { n: 0, fondo: 0, primero: '', ultimo: '' };
}
