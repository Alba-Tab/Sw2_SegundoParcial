import type { TfliteModel } from 'react-native-fast-tflite';
import type { Frame } from 'react-native-vision-camera';
import { BOCA, OJO_DERECHO, OJO_IZQUIERDO } from '../dominio/fatiga';

/**
 * Adaptador de la malla facial de MediaPipe (`face_landmark.tflite`, D60). Corre como *worklet* en el hilo de la
 * cámara: recorta un cuadrado alrededor del rostro, lo escala a 192 × 192 RGB en [0, 1] y devuelve solo los puntos de
 * los ojos y la boca (en píxeles del cuadro) y la caja del rostro. El cuadro se libera ahí mismo: ninguna imagen se
 * guarda ni sale del celular.
 *
 * Como en MediaPipe, el recorte sigue al rostro del cuadro anterior (1,5 veces su caja); sin rostro, vuelve al centro.
 */
export const LADO_MODELO = 192;
/** Índices de la malla que la pantalla necesita, en este orden. */
export const PUNTOS: number[] = [...OJO_IZQUIERDO, ...OJO_DERECHO, ...BOCA];
const UMBRAL_ROSTRO = 0.5;

export interface Recorte {
  cx: number;
  cy: number;
  lado: number;
}

export interface Lectura {
  /** Ancho y alto del cuadro ya rotado. */
  ancho: number;
  alto: number;
  espejo: boolean;
  /** Caja del rostro en píxeles del cuadro; null sin rostro. */
  caja: { x: number; y: number; ancho: number; alto: number } | null;
  /** Pares x, y de cada índice de PUNTOS (vacío sin rostro). */
  puntos: number[];
}

export function analizarCuadro(frame: Frame, modelo: TfliteModel, anterior: Recorte | null): { lectura: Lectura; recorte: Recorte | null } {
  'worklet';
  const ancho = frame.width;
  const alto = frame.height;
  const bytes = new Uint8Array(frame.getPixelBuffer());
  const fila = frame.bytesPerRow;
  const porPixel = Math.max(3, Math.min(4, Math.floor(fila / ancho)));
  // BGRA en iOS; RGBA o RGB en Android.
  const bgr = frame.pixelFormat === 'rgb-bgra-8-bit';
  const r0 = bgr ? 2 : 0;
  const b0 = bgr ? 0 : 2;

  const recorte = anterior ?? { cx: ancho / 2, cy: alto / 2, lado: Math.min(ancho, alto) * 0.8 };
  const x0 = recorte.cx - recorte.lado / 2;
  const y0 = recorte.cy - recorte.lado / 2;
  const paso = recorte.lado / LADO_MODELO;
  const entrada = new Float32Array(LADO_MODELO * LADO_MODELO * 3);
  for (let j = 0; j < LADO_MODELO; j++) {
    const y = Math.floor(y0 + (j + 0.5) * paso);
    for (let i = 0; i < LADO_MODELO; i++) {
      const x = Math.floor(x0 + (i + 0.5) * paso);
      const k = (j * LADO_MODELO + i) * 3;
      if (x < 0 || y < 0 || x >= ancho || y >= alto) continue; // fuera del cuadro queda en negro
      const p = y * fila + x * porPixel;
      entrada[k] = bytes[p + r0] / 255;
      entrada[k + 1] = bytes[p + 1] / 255;
      entrada[k + 2] = bytes[p + b0] / 255;
    }
  }

  const salidas = modelo.runSync([entrada.buffer]).map((b) => new Float32Array(b));
  const malla = salidas.find((s) => s.length >= 468 * 3);
  const bandera = salidas.find((s) => s.length === 1);
  const vacia: Lectura = { ancho, alto, espejo: frame.isMirrored, caja: null, puntos: [] };
  if (!malla || !bandera || 1 / (1 + Math.exp(-bandera[0])) < UMBRAL_ROSTRO) return { lectura: vacia, recorte: null };

  // Puntos de la malla (en el espacio de 192 px del recorte) a píxeles del cuadro.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let n = 0; n < 468; n++) {
    const x = x0 + malla[n * 3] * paso;
    const y = y0 + malla[n * 3 + 1] * paso;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const puntos: number[] = [];
  for (const n of PUNTOS) puntos.push(x0 + malla[n * 3] * paso, y0 + malla[n * 3 + 1] * paso);
  return {
    lectura: { ...vacia, caja: { x: minX, y: minY, ancho: maxX - minX, alto: maxY - minY }, puntos },
    recorte: { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, lado: Math.max(maxX - minX, maxY - minY) * 1.5 },
  };
}

/** Los puntos de una lectura como malla del dominio (índice original de MediaPipe → x, y). */
export function mallaDe(lectura: Lectura): (indice: number) => readonly [number, number] {
  return (indice) => {
    const k = PUNTOS.indexOf(indice);
    return [lectura.puntos[k * 2], lectura.puntos[k * 2 + 1]];
  };
}
