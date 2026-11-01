import { GPS_CADA_METROS, GPS_CADA_MS } from './gps';

export interface Lectura {
  lat: number;
  lng: number;
  /** m/s, como lo da el GPS del celular; negativo si no se conoce. */
  velocidadMs: number;
  precisionMetros: number | null;
  /** Hora de la lectura en ms. */
  en: number;
}

/** Distancia en metros entre dos coordenadas (haversine). */
export function metros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** D52: se guarda un punto cada 20 s o cada 100 m, lo que ocurra primero; el resto de lecturas se descarta. */
export class MuestreoGps {
  private ultima: Lectura | null = null;

  aceptar(l: Lectura): boolean {
    const u = this.ultima;
    if (u && l.en - u.en < GPS_CADA_MS && metros(u, l) < GPS_CADA_METROS) return false;
    this.ultima = l;
    return true;
  }
}

export const kmh = (velocidadMs: number) => Math.max(0, Math.round(velocidadMs * 3.6 * 10) / 10);

/** Una lectura de más de 10 s ya no dice a qué velocidad va el camión. */
export const LECTURA_VIGENTE_MS = 10_000;

/**
 * km/h de la última lectura: la que da el GPS o, si no la da (`-1`: iOS sin dato, Android sin `hasSpeed`), distancia
 * sobre tiempo desde la anterior. `null` si no se sabe: sin lecturas, con la última de más de 10 s o sin anterior.
 */
export function velocidadEstimada(ultima: Lectura | null, anterior: Lectura | null, ahora: number): number | null {
  if (!ultima || ahora - ultima.en > LECTURA_VIGENTE_MS) return null;
  if (ultima.velocidadMs >= 0) return kmh(ultima.velocidadMs);
  if (!anterior || ultima.en <= anterior.en) return null;
  return kmh(metros(anterior, ultima) / ((ultima.en - anterior.en) / 1000));
}
