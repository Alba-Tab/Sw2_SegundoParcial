/** Bitácora del viaje (spec 005, CU-06). */
export const TIPOS_HITO = ['BLOQUEO', 'PARADA', 'PUNTO_CONTROL', 'FALLA_MECANICA', 'OTRO'] as const;
export type TipoHito = (typeof TIPOS_HITO)[number];
export type OrigenHito = 'VOZ' | 'TEXTO';

/** D58: con el camión a más de 5 km/h la app solo deja dictar, no escribir (propuesta 6.5). */
export const VELOCIDAD_MAXIMA_PARA_ESCRIBIR_KMH = 5;

export function puedeEscribir(velocidadKmh: number): boolean {
  return velocidadKmh <= VELOCIDAD_MAXIMA_PARA_ESCRIBIR_KMH;
}

/** 3 a 500 caracteres, como valida Viajes (`HitoNuevo`). */
export function descripcionValida(texto: string): boolean {
  const t = texto.trim();
  return t.length >= 3 && t.length <= 500;
}
