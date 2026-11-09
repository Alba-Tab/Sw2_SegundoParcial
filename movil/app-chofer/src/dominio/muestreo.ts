import { GPS_CADA_METROS, GPS_CADA_MS, LECTURA_GPS_CADA_MS } from './gps';

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

/**
 * Una lectura de más de dos intervalos del GPS (20 s) ya no dice a qué velocidad va el camión. Con uno solo, cualquier
 * lectura algo tardía dejaba la velocidad desconocida y daba SIN_ROSTRO falsos con el camión detenido.
 */
export const LECTURA_VIGENTE_MS = 2 * LECTURA_GPS_CADA_MS;

/** La velocidad por distancia se calcula con lecturas separadas por 5 s o más: con menos, el ruido del GPS manda. */
export const SEPARACION_VELOCIDAD_MS = 5000;

/** Agrega la lectura y deja solo las de los últimos 5 s más la última anterior a eso (la que sirve para estimar). */
export function agregarLectura(lecturas: Lectura[], l: Lectura): Lectura[] {
  const r = [...lecturas, l];
  while (r.length > 2 && r[1].en <= l.en - SEPARACION_VELOCIDAD_MS) r.shift();
  return r;
}

/**
 * km/h de la última lectura: la que da el GPS o, si no la da (`-1`: iOS sin dato, Android sin `hasSpeed`), distancia
 * sobre tiempo desde una lectura de 5 s antes o más. Un desplazamiento menor que la precisión de las lecturas es ruido
 * del GPS con el camión parado: 0. `null` si no se sabe: sin lecturas, con la última de más de 20 s o sin otra 5 s antes.
 */
export function velocidadEstimada(lecturas: Lectura[], ahora: number): number | null {
  const ultima = lecturas.at(-1);
  if (!ultima || ahora - ultima.en > LECTURA_VIGENTE_MS) return null;
  if (ultima.velocidadMs >= 0) return kmh(ultima.velocidadMs);
  const anterior = [...lecturas].reverse().find((l) => ultima.en - l.en >= SEPARACION_VELOCIDAD_MS);
  if (!anterior) return null;
  const d = metros(anterior, ultima);
  // El error de la peor de las dos lecturas: dentro de ese radio no se sabe si se movió.
  if (d < Math.max(anterior.precisionMetros ?? 0, ultima.precisionMetros ?? 0)) return 0;
  return kmh(d / ((ultima.en - anterior.en) / 1000));
}
