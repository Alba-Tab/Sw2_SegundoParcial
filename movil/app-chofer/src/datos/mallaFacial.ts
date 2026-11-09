import type { TfliteModel } from 'react-native-fast-tflite';
import type { Frame } from 'react-native-vision-camera';
import type { Medidas } from '../dominio/fatiga';

/**
 * Adaptador de MediaPipe Face Landmarker (D60): los tres modelos de `face_landmarker.task` corren como *worklet* en el
 * hilo de la cámara, como en el grafo de MediaPipe:
 *
 * 1. `face_detector.tflite` (BlazeFace, 128 × 128) busca el rostro en el cuadro entero. Solo corre cuando no hay un
 *    rostro seguido del cuadro anterior; sin él, la malla correría sobre la pared e inventaría un rostro.
 * 2. `face_landmarks_detector.tflite` (256 × 256) da los 478 puntos y si de verdad hay un rostro en el recorte.
 * 3. `face_blendshapes.tflite` da 52 puntajes; se usan `eyeBlinkLeft/Right` y `jawOpen`.
 *
 * El cuadro se libera ahí mismo: ninguna imagen se guarda ni sale del celular.
 */
export interface ModelosRostro {
  detector: TfliteModel;
  malla: TfliteModel;
  gestos: TfliteModel;
}

/** Un cuadrado del cuadro, girado `angulo` radianes alrededor de su centro (como el recorte de MediaPipe). */
export interface Recorte {
  cx: number;
  cy: number;
  lado: number;
  angulo: number;
}

export interface Lectura {
  /** Ancho y alto del cuadro ya rotado. */
  ancho: number;
  alto: number;
  espejo: boolean;
  /** Caja del rostro en píxeles del cuadro; null sin rostro. */
  caja: { x: number; y: number; ancho: number; alto: number } | null;
  medidas: Medidas | null;
}

const UMBRAL = 0.5;
const LADO_DETECTOR = 128;
const LADO_MALLA = 256;
/** Puntos que recibe el modelo de gestos (`kLandmarksSubsetIdxs` de face_blendshapes_graph.cc). */
const PUNTOS_GESTOS = [
  0, 1, 4, 5, 6, 7, 8, 10, 13, 14, 17, 21, 33, 37, 39, 40, 46, 52, 53, 54, 55, 58, 61, 63, 65, 66, 67, 70, 78, 80, 81, 82, 84, 87, 88, 91,
  93, 95, 103, 105, 107, 109, 127, 132, 133, 136, 144, 145, 146, 148, 149, 150, 152, 153, 154, 155, 157, 158, 159, 160, 161, 162, 163, 168,
  172, 173, 176, 178, 181, 185, 191, 195, 197, 234, 246, 249, 251, 263, 267, 269, 270, 276, 282, 283, 284, 285, 288, 291, 293, 295, 296,
  297, 300, 308, 310, 311, 312, 314, 317, 318, 321, 323, 324, 332, 334, 336, 338, 356, 361, 362, 365, 373, 374, 375, 377, 378, 379, 380,
  381, 382, 384, 385, 386, 387, 388, 389, 390, 397, 398, 400, 402, 405, 409, 415, 454, 466, 468, 469, 470, 471, 472, 473, 474, 475, 476,
  477,
];
const OJO_IZQUIERDO = 9;
const OJO_DERECHO = 10;
const BOCA_ABIERTA = 25;
const FRENTE = 10;
const MENTON = 152;

const sigmoide = (x: number) => {
  'worklet';
  return 1 / (1 + Math.exp(-Math.max(-100, Math.min(100, x))));
};

export function analizarCuadro(
  frame: Frame,
  modelos: ModelosRostro,
  anterior: Recorte | null,
): { lectura: Lectura; recorte: Recorte | null } {
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
  const vacia: Lectura = { ancho, alto, espejo: frame.isMirrored, caja: null, medidas: null };

  /** Un punto del recorte (u, v en [0, 1]) a píxeles del cuadro, con el giro del recorte. */
  const alCuadro = (r: Recorte, u: number, v: number): [number, number] => {
    const du = (u - 0.5) * r.lado;
    const dv = (v - 0.5) * r.lado;
    const cos = Math.cos(r.angulo);
    const sin = Math.sin(r.angulo);
    return [r.cx + du * cos - dv * sin, r.cy + du * sin + dv * cos];
  };

  /** El recorte escalado a n × n RGB; lo que cae fuera del cuadro queda en negro. */
  const muestrear = (r: Recorte, n: number, menosUno: boolean) => {
    const a = menosUno ? 2 / 255 : 1 / 255;
    const b = menosUno ? -1 : 0;
    const entrada = new Float32Array(n * n * 3).fill(b);
    const cos = Math.cos(r.angulo);
    const sin = Math.sin(r.angulo);
    const paso = r.lado / n;
    for (let j = 0; j < n; j++) {
      const dv = (j + 0.5) * paso - r.lado / 2;
      for (let i = 0; i < n; i++) {
        const du = (i + 0.5) * paso - r.lado / 2;
        const x = Math.floor(r.cx + du * cos - dv * sin);
        const y = Math.floor(r.cy + du * sin + dv * cos);
        if (x < 0 || y < 0 || x >= ancho || y >= alto) continue;
        const k = (j * n + i) * 3;
        const p = y * fila + x * porPixel;
        entrada[k] = bytes[p + r0] * a + b;
        entrada[k + 1] = bytes[p + 1] * a + b;
        entrada[k + 2] = bytes[p + b0] * a + b;
      }
    }
    return entrada;
  };

  let recorte = anterior;
  if (!recorte) {
    // BlazeFace sobre el cuadro entero (cuadrado con bandas, como el FIT de MediaPipe), valores en [-1, 1].
    const todo = { cx: ancho / 2, cy: alto / 2, lado: Math.max(ancho, alto), angulo: 0 };
    const salidas = modelos.detector.runSync([muestrear(todo, LADO_DETECTOR, true).buffer]).map((s) => new Float32Array(s));
    const cajas = salidas.find((s) => s.length === 896 * 16);
    const puntajes = salidas.find((s) => s.length === 896);
    if (!cajas || !puntajes) return { lectura: vacia, recorte: null };
    let mejor = -1;
    let puntaje = UMBRAL;
    for (let i = 0; i < 896; i++) {
      const s = sigmoide(puntajes[i]);
      if (s > puntaje) {
        puntaje = s;
        mejor = i;
      }
    }
    if (mejor < 0) return { lectura: vacia, recorte: null };
    // Anclas SSD del modelo de rango corto: 16 × 16 celdas con 2 anclas y 8 × 8 con 6, de tamaño fijo.
    const grande = mejor < 512;
    const celdas = grande ? 16 : 8;
    const celda = grande ? Math.floor(mejor / 2) : Math.floor((mejor - 512) / 6);
    const ax = ((celda % celdas) + 0.5) / celdas;
    const ay = (Math.floor(celda / celdas) + 0.5) / celdas;
    const c = mejor * 16;
    const cx = cajas[c] / LADO_DETECTOR + ax;
    const cy = cajas[c + 1] / LADO_DETECTOR + ay;
    const lado = Math.max(cajas[c + 2], cajas[c + 3]) / LADO_DETECTOR;
    // Giro de la cabeza: la línea entre los ojos (puntos clave 0 y 1 de BlazeFace) queda horizontal en el recorte.
    const ojoX = (k: number) => cajas[c + 4 + k * 2] / LADO_DETECTOR + ax;
    const ojoY = (k: number) => cajas[c + 5 + k * 2] / LADO_DETECTOR + ay;
    recorte = {
      cx: todo.cx + (cx - 0.5) * todo.lado,
      cy: todo.cy + (cy - 0.5) * todo.lado,
      lado: lado * todo.lado * 1.5,
      angulo: Math.atan2(ojoY(1) - ojoY(0), ojoX(1) - ojoX(0)),
    };
  }

  const salidas = modelos.malla.runSync([muestrear(recorte, LADO_MALLA, false).buffer]).map((s) => new Float32Array(s));
  // Salidas en orden: Identity (478 × 3 puntos), Identity_1 (presencia del rostro) e Identity_2 (no se usa).
  const malla = salidas[0];
  const bandera = salidas[1];
  if (malla?.length !== 478 * 3 || bandera?.length !== 1 || sigmoide(bandera[0]) < UMBRAL) return { lectura: vacia, recorte: null };

  // Tamaño y centro en el espacio del recorte (sin el giro) y la caja de la pantalla en el del cuadro.
  const r = recorte;
  const punto = (n: number) => alCuadro(r, malla[n * 3] / LADO_MALLA, malla[n * 3 + 1] / LADO_MALLA);
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let n = 0; n < 468; n++) {
    minU = Math.min(minU, malla[n * 3]);
    minV = Math.min(minV, malla[n * 3 + 1]);
    maxU = Math.max(maxU, malla[n * 3]);
    maxV = Math.max(maxV, malla[n * 3 + 1]);
    const [x, y] = punto(n);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const paso = r.lado / LADO_MALLA;
  const lado = Math.max(maxU - minU, maxV - minV) * paso * 1.5;
  const [cx, cy] = alCuadro(r, (minU + maxU) / 2 / LADO_MALLA, (minV + maxV) / 2 / LADO_MALLA);
  const [ox0, oy0] = punto(33);
  const [ox1, oy1] = punto(263);

  // El modelo de gestos recibe los puntos en píxeles del cuadro.
  const puntos = new Float32Array(PUNTOS_GESTOS.length * 2);
  PUNTOS_GESTOS.forEach((n, k) => {
    const [x, y] = punto(n);
    puntos[k * 2] = x;
    puntos[k * 2 + 1] = y;
  });
  const gestos = new Float32Array(modelos.gestos.runSync([puntos.buffer])[0]);

  // Inclinación: con la cabeza que cae, la frente se acerca a la cámara (z menor) respecto del mentón.
  const dy = malla[MENTON * 3 + 1] - malla[FRENTE * 3 + 1];
  const dz = malla[MENTON * 3 + 2] - malla[FRENTE * 3 + 2];
  const cabeceo = (Math.atan2(dz, dy) * 180) / Math.PI;

  return {
    lectura: {
      ...vacia,
      caja: { x: minX, y: minY, ancho: maxX - minX, alto: maxY - minY },
      medidas: {
        ojos: (gestos[OJO_IZQUIERDO] + gestos[OJO_DERECHO]) / 2,
        boca: gestos[BOCA_ABIERTA],
        cabeceo,
        alto: ((maxV - minV) * paso) / alto,
      },
    },
    // Si la malla se encogió de golpe (ojos tapados), el próximo cuadro vuelve a buscar el rostro entero con BlazeFace.
    recorte: lado < r.lado * 0.6 ? null : { cx, cy, lado, angulo: Math.atan2(oy1 - oy0, ox1 - ox0) },
  };
}
