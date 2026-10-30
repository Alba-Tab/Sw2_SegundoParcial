/** Un punto de la cola GPS (spec 005): un `seq` creciente por dispositivo y viaje. */
export interface PuntoGps {
  viajeId: string;
  seq: number;
  registradaEn: string;
  lat: number;
  lng: number;
  velocidadKmh: number;
  precisionMetros: number | null;
}

/** D52: un punto cada 20 s o cada 100 m, lo que ocurra primero. */
export const GPS_CADA_MS = 20_000;
export const GPS_CADA_METROS = 100;
/** Hasta 100 puntos por lote (D56), un lote cada 90 s con señal (propuesta 4.4). */
export const PUNTOS_POR_LOTE = 100;
export const SINCRONIZAR_CADA_MS = 90_000;
