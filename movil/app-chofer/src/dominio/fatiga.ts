/**
 * D60 (ampliada): alerta de fatiga por cinco motivos. Las medidas salen de MediaPipe Face Landmarker: los puntajes ya
 * calibrados `eyeBlinkLeft/Right` y `jawOpen` (0 a 1) y la inclinación de la cabeza calculada con la malla. Las
 * imágenes no salen del celular; aquí solo llegan números.
 *
 * - OJOS_CERRADOS: ojos cerrados 1,5 s seguidos.
 * - SOMNOLENCIA: PERCLOS, ojos cerrados más del 30 % del último minuto (parpadeo lento que no llega a 1,5 s).
 * - CABECEO: la cabeza cae 20° o más respecto de su posición habitual durante 1 s.
 * - SIN_ROSTRO: no se ve el rostro (mirada fuera, gorra o mano encima) durante 3 s con el camión a más de 5 km/h (el
 *   umbral de D58; detenido, el chofer carga, muestra papeles en un control o mira los espejos). Con los ojos tapados la
 *   malla se acomoda sobre la mitad de abajo de la cara y sigue viendo "un rostro" de la mitad del tamaño: un rostro que
 *   se encoge de golpe por debajo del 60 % de su tamaño habitual también cuenta como no visible.
 * - BOSTEZOS: 3 bostezos en 2 minutos.
 */
export const OJO_CERRADO = 0.5;
export const OJOS_CERRADOS_MS = 1500;
export const PERCLOS_VENTANA_MS = 60_000;
export const PERCLOS_ALERTA = 0.3;
/** Con menos de 30 s de muestras el porcentaje no dice nada. */
export const PERCLOS_MINIMO_MS = 30_000;
export const CABECEO_GRADOS = 20;
export const CABECEO_MS = 1000;
export const SIN_ROSTRO_MS = 3000;
/** D58: por encima de esto el camión está en marcha (decisión del 01-11-2026 para SIN_ROSTRO). */
export const SIN_ROSTRO_KMH = 5;
export const ROSTRO_CUBIERTO = 0.6;
export const BOCA_BOSTEZO = 0.6;
export const BOSTEZO_MS = 1000;
export const BOSTEZOS_ALERTA = 3;
export const VENTANA_BOSTEZOS_MS = 120_000;
/** Constante de tiempo de las bases (posición de la cabeza y tamaño del rostro): independiente de los cuadros por segundo. */
export const BASE_TAU_MS = 30_000;
/** Mientras la cabeza baja más de esto respecto de su base, la base no la sigue (si no, una caída lenta nunca alerta). */
export const CABECEO_CONGELA_GRADOS = 8;
/** Un rostro encogido por más de esto es la nueva normalidad (el chofer se recostó o movió el soporte), no un tapado. */
export const REBASE_ALTO_MS = 10_000;
/** Igual con la cabeza: más de esto abajo sin volver es la nueva postura (y el cabeceo vuelve a vigilar desde ahí). */
export const REBASE_CABECEO_MS = 30_000;
/** El tamaño habitual del rostro sale de la mediana de los primeros 2 s, no de un solo cuadro. */
export const CALIBRACION_MS = 2000;

/** Un hueco sin rostro más corto que esto (un cuadro perdido, la cabeza que se inclina) no corta el episodio. */
export const HUECO_SIN_ROSTRO_MS = 500;

export type MotivoFatiga = 'OJOS_CERRADOS' | 'SOMNOLENCIA' | 'CABECEO' | 'SIN_ROSTRO' | 'BOSTEZOS';

export interface Medidas {
  /** Promedio de `eyeBlinkLeft` y `eyeBlinkRight`: 0 abiertos, 1 cerrados. */
  ojos: number;
  /** `jawOpen`: 0 boca cerrada, 1 abierta del todo. */
  boca: number;
  /** Inclinación de la cabeza en grados (positivo: hacia abajo). */
  cabeceo: number;
  /** Alto de la caja del rostro sobre el alto del cuadro. */
  alto: number;
}

/**
 * Recibe una muestra por cuadro (`null` cuando no hay rostro) y avisa una sola vez por episodio de cada motivo. La
 * posición habitual de la cabeza y el tamaño habitual del rostro son promedios lentos (por tiempo, no por cuadro): así
 * el celular puede ir en el tablero, más abajo que la cara, sin que eso cuente como cabeceo.
 */
export class DetectorFatiga {
  private cerradosDesde: number | null = null;
  private avisoOjos = false;
  private muestrasOjos: { en: number; cerrado: boolean }[] = [];
  private avisoPerclos = false;
  private cabeceoBase: number | null = null;
  private cabeceoDesde: number | null = null;
  private avisoCabeceo = false;
  private sinRostroDesde: number | null = null;
  private avisoSinRostro = false;
  private bostezoDesde: number | null = null;
  private bostezoContado = false;
  private bostezos: number[] = [];
  private ultimoRostro: number | null = null;
  private altoBase: number | null = null;
  private encogidoDesde: number | null = null;
  private calibracion: { desde: number; altos: number[] } | null = null;
  private congeladoDesde: number | null = null;
  private anterior: number | null = null;
  private alfa = 0;
  /** Si la última muestra contó como rostro visible (para que la pantalla no diga «vigilando» cuando no puede). */
  rostroVisible = false;

  /**
   * `velocidadKmh` solo la usa SIN_ROSTRO. `null` (no se sabe) cuenta como en marcha: el detector solo corre con el
   * viaje en ruta, y es mejor una alerta de más que quedar ciego.
   */
  muestra(en: number, m: Medidas | null, velocidadKmh: number | null): MotivoFatiga | null {
    this.alfa = this.anterior === null ? 1 : 1 - Math.exp(-(en - this.anterior) / BASE_TAU_MS);
    this.anterior = en;
    this.rostroVisible = false;
    if (!m) return this.sinRostro(en, velocidadKmh);
    if (this.altoBase === null) {
      this.calibracion ??= { desde: en, altos: [] };
      this.calibracion.altos.push(m.alto);
      if (en - this.calibracion.desde >= CALIBRACION_MS) {
        const altos = [...this.calibracion.altos].sort((a, b) => a - b);
        this.altoBase = altos[Math.floor(altos.length / 2)];
      }
    } else if (m.alto < this.altoBase * ROSTRO_CUBIERTO) {
      this.encogidoDesde ??= en;
      if (en - this.encogidoDesde < REBASE_ALTO_MS) return this.sinRostro(en, velocidadKmh);
      this.altoBase = m.alto;
    }
    this.encogidoDesde = null;
    if (this.altoBase !== null) this.altoBase += (m.alto - this.altoBase) * this.alfa;
    this.rostroVisible = true;
    this.ultimoRostro = en;
    this.sinRostroDesde = null;
    this.avisoSinRostro = false;
    return this.ojos(en, m.ojos) ?? this.perclos(en, m.ojos) ?? this.cabeza(en, m.cabeceo) ?? this.boca(en, m.boca);
  }

  /** Cuántos bostezos lleva en la ventana de 2 minutos (para la etiqueta de la pantalla). */
  bostezosRecientes(en: number): number {
    return this.bostezos.filter((t) => en - t <= VENTANA_BOSTEZOS_MS).length;
  }

  private sinRostro(en: number, velocidadKmh: number | null): MotivoFatiga | null {
    // Un hueco corto no corta el episodio; uno de 0,5 s o más sí (sin olvidar los bostezos de la ventana).
    if (this.ultimoRostro === null || en - this.ultimoRostro >= HUECO_SIN_ROSTRO_MS) {
      this.cerradosDesde = null;
      this.avisoOjos = false;
      this.cabeceoDesde = null;
      this.avisoCabeceo = false;
      this.bostezoDesde = null;
      this.bostezoContado = false;
    }
    // Detenido no cuenta, y al arrancar los 3 s empiezan de nuevo.
    this.sinRostroDesde = velocidadKmh === null || velocidadKmh > SIN_ROSTRO_KMH ? (this.sinRostroDesde ?? en) : null;
    if (this.sinRostroDesde === null || this.avisoSinRostro || en - this.sinRostroDesde < SIN_ROSTRO_MS) return null;
    this.avisoSinRostro = true;
    return 'SIN_ROSTRO';
  }

  private ojos(en: number, valor: number): MotivoFatiga | null {
    if (valor < OJO_CERRADO) {
      this.cerradosDesde = null;
      this.avisoOjos = false;
      return null;
    }
    this.cerradosDesde ??= en;
    if (this.avisoOjos || en - this.cerradosDesde < OJOS_CERRADOS_MS) return null;
    this.avisoOjos = true;
    return 'OJOS_CERRADOS';
  }

  private perclos(en: number, valor: number): MotivoFatiga | null {
    this.muestrasOjos.push({ en, cerrado: valor >= OJO_CERRADO });
    while (this.muestrasOjos.length && en - this.muestrasOjos[0].en > PERCLOS_VENTANA_MS) this.muestrasOjos.shift();
    const cubre = en - this.muestrasOjos[0].en;
    const porcentaje = this.muestrasOjos.filter((s) => s.cerrado).length / this.muestrasOjos.length;
    // Vuelve a avisar recién cuando el porcentaje baja a la mitad del umbral.
    if (porcentaje < PERCLOS_ALERTA / 2) this.avisoPerclos = false;
    if (this.avisoPerclos || cubre < PERCLOS_MINIMO_MS || porcentaje <= PERCLOS_ALERTA) return null;
    this.avisoPerclos = true;
    return 'SOMNOLENCIA';
  }

  private cabeza(en: number, grados: number): MotivoFatiga | null {
    this.cabeceoBase ??= grados;
    if (grados - this.cabeceoBase < CABECEO_CONGELA_GRADOS) {
      this.congeladoDesde = null;
      this.cabeceoBase += (grados - this.cabeceoBase) * this.alfa;
    } else if (en - (this.congeladoDesde ??= en) >= REBASE_CABECEO_MS) {
      // Lleva 30 s abajo sin volver: nueva postura o soporte movido. Sin esto, el cabeceo quedaba ciego.
      this.cabeceoBase = grados;
      this.congeladoDesde = null;
    }
    if (grados - this.cabeceoBase < CABECEO_GRADOS) {
      this.cabeceoDesde = null;
      this.avisoCabeceo = false;
      return null;
    }
    this.cabeceoDesde ??= en;
    if (this.avisoCabeceo || en - this.cabeceoDesde < CABECEO_MS) return null;
    this.avisoCabeceo = true;
    return 'CABECEO';
  }

  private boca(en: number, valor: number): MotivoFatiga | null {
    if (valor <= BOCA_BOSTEZO) {
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
