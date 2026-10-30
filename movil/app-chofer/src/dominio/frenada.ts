/**
 * D08 y D59: una frenada es brusca si la desaceleración llega a 0,4 g o más sostenida 300 ms con el camión a más de
 * 20 km/h. El acelerómetro se lee a 10 Hz; se registra como mucho una frenada cada 10 s, con el pico como magnitud.
 */
export const UMBRAL_G = 0.4;
export const SOSTENIDA_MS = 300;
export const VELOCIDAD_MINIMA_KMH = 20;
export const ENTRE_FRENADAS_MS = 10_000;

export class DetectorFrenadas {
  private desde: number | null = null;
  private pico = 0;
  private ultima = -Infinity;

  /** Devuelve la magnitud (g) cuando detecta una frenada; null mientras no. */
  muestra(en: number, desaceleracionG: number, velocidadKmh: number): number | null {
    if (desaceleracionG < UMBRAL_G || velocidadKmh <= VELOCIDAD_MINIMA_KMH) {
      this.desde = null;
      this.pico = 0;
      return null;
    }
    this.desde ??= en;
    this.pico = Math.max(this.pico, desaceleracionG);
    if (en - this.desde < SOSTENIDA_MS || en - this.ultima < ENTRE_FRENADAS_MS) return null;
    this.ultima = en;
    this.desde = null;
    const magnitud = Math.round(this.pico * 100) / 100;
    this.pico = 0;
    return magnitud;
  }
}
