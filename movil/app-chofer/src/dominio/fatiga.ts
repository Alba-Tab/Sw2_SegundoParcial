/**
 * D60: alerta de fatiga si los ojos quedan cerrados 1,5 s o más, o con 3 bostezos en 2 minutos. Las medidas salen de
 * los 468 puntos de la malla facial de MediaPipe (`face_landmark.tflite`): la apertura de cada ojo (EAR) y de la boca
 * (MAR). Las imágenes no salen del celular; aquí solo llegan números.
 */
export const EAR_CERRADO = 0.2;
export const OJOS_CERRADOS_MS = 1500;
export const MAR_BOSTEZO = 0.6;
export const BOSTEZO_MS = 1000;
export const BOSTEZOS_ALERTA = 3;
export const VENTANA_BOSTEZOS_MS = 120_000;
/** Un hueco sin rostro más corto que esto (un cuadro perdido, la cabeza que se inclina) no corta el episodio. */
export const HUECO_SIN_ROSTRO_MS = 500;

/** Puntos de la malla: comisura externa, dos del párpado de arriba, comisura interna y dos del de abajo. */
export const OJO_IZQUIERDO = [33, 160, 158, 133, 153, 144] as const;
export const OJO_DERECHO = [362, 385, 387, 263, 373, 380] as const;
/** Labio de arriba, labio de abajo, comisura izquierda y derecha. */
export const BOCA = [13, 14, 78, 308] as const;

export type Punto = readonly [number, number];
export type Malla = (indice: number) => Punto;
export type MotivoFatiga = 'OJOS_CERRADOS' | 'BOSTEZOS';

const distancia = (a: Punto, b: Punto) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Eye Aspect Ratio (Soukupová y Čech, 2016): cae cerca de 0 con el ojo cerrado. */
export function ear(malla: Malla, ojo: readonly number[]): number {
  const [p1, p2, p3, p4, p5, p6] = ojo.map(malla);
  const ancho = distancia(p1, p4);
  return ancho === 0 ? 0 : (distancia(p2, p6) + distancia(p3, p5)) / (2 * ancho);
}

/** Mouth Aspect Ratio: alto de la boca sobre su ancho. */
export function mar(malla: Malla): number {
  const [arriba, abajo, izquierda, derecha] = BOCA.map(malla);
  const ancho = distancia(izquierda, derecha);
  return ancho === 0 ? 0 : distancia(arriba, abajo) / ancho;
}

export function medidas(malla: Malla): { ear: number; mar: number } {
  return { ear: (ear(malla, OJO_IZQUIERDO) + ear(malla, OJO_DERECHO)) / 2, mar: mar(malla) };
}

/**
 * Recibe una muestra por cuadro (`null` cuando no hay rostro) y avisa una sola vez por episodio: los ojos tienen que
 * abrirse antes de otra alerta por ojos cerrados, y los bostezos que ya dispararon una alerta no cuentan para la
 * siguiente. Un hueco sin rostro de menos de 0,5 s no corta el episodio: el tiempo con los ojos cerrados sigue
 * contando desde que se cerraron.
 */
export class DetectorFatiga {
  private cerradosDesde: number | null = null;
  private avisoOjos = false;
  private bostezoDesde: number | null = null;
  private bostezoContado = false;
  private bostezos: number[] = [];
  private ultimoRostro: number | null = null;

  muestra(en: number, m: { ear: number; mar: number } | null): MotivoFatiga | null {
    if (!m) {
      // Sin rostro no se puede medir. Si el hueco ya dura 0,5 s, se corta el episodio en curso (pero no se olvidan los
      // bostezos de la ventana).
      if (this.ultimoRostro === null || en - this.ultimoRostro >= HUECO_SIN_ROSTRO_MS) this.cortarEpisodio();
      return null;
    }
    this.ultimoRostro = en;
    return this.ojos(en, m.ear) ?? this.boca(en, m.mar);
  }

  private cortarEpisodio() {
    this.cerradosDesde = null;
    this.avisoOjos = false;
    this.bostezoDesde = null;
    this.bostezoContado = false;
  }

  /** Cuántos bostezos lleva en la ventana de 2 minutos (para la etiqueta de la pantalla). */
  bostezosRecientes(en: number): number {
    return this.bostezos.filter((t) => en - t <= VENTANA_BOSTEZOS_MS).length;
  }

  private ojos(en: number, valor: number): MotivoFatiga | null {
    if (valor >= EAR_CERRADO) {
      this.cerradosDesde = null;
      this.avisoOjos = false;
      return null;
    }
    this.cerradosDesde ??= en;
    if (this.avisoOjos || en - this.cerradosDesde < OJOS_CERRADOS_MS) return null;
    this.avisoOjos = true;
    return 'OJOS_CERRADOS';
  }

  private boca(en: number, valor: number): MotivoFatiga | null {
    if (valor <= MAR_BOSTEZO) {
      this.bostezoDesde = null;
      this.bostezoContado = false;
      return null;
    }
    this.bostezoDesde ??= en;
    if (this.bostezoContado || en - this.bostezoDesde < BOSTEZO_MS) return null;
    this.bostezoContado = true;
    this.bostezos = [...this.bostezos.filter((t) => en - t <= VENTANA_BOSTEZOS_MS), en];
    if (this.bostezos.length < BOSTEZOS_ALERTA) return null;
    this.bostezos = [];
    return 'BOSTEZOS';
  }
}
