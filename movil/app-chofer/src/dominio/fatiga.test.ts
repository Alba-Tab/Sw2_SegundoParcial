import { describe, expect, it } from 'vitest';
import { DetectorFatiga, ear, mar, type Punto, OJO_IZQUIERDO } from './fatiga';

const abiertos = { ear: 0.3, mar: 0.1 };
const cerrados = { ear: 0.1, mar: 0.1 };
const bostezo = { ear: 0.3, mar: 0.8 };

/** Cuadros cada 100 ms desde `desde` hasta `hasta` (incluido); devuelve las alertas. */
function serie(d: DetectorFatiga, desde: number, hasta: number, m: { ear: number; mar: number } | null) {
  const alertas = [];
  for (let t = desde; t <= hasta; t += 100) {
    const a = d.muestra(t, m);
    if (a) alertas.push({ t, a });
  }
  return alertas;
}

describe('medidas de la malla', () => {
  it('EAR: alto de los párpados sobre el ancho del ojo', () => {
    const puntos: Record<number, Punto> = { 33: [0, 0], 160: [1, 1], 158: [2, 1], 133: [3, 0], 153: [2, -1], 144: [1, -1] };
    expect(ear((i) => puntos[i], OJO_IZQUIERDO)).toBeCloseTo(2 / 3);
    const cerrado: Record<number, Punto> = { ...puntos, 160: [1, 0.1], 158: [2, 0.1], 153: [2, -0.1], 144: [1, -0.1] };
    expect(ear((i) => cerrado[i], OJO_IZQUIERDO)).toBeLessThan(0.2);
  });

  it('MAR: alto de la boca sobre su ancho', () => {
    const boca: Record<number, Punto> = { 13: [5, 0], 14: [5, 4], 78: [0, 2], 308: [10, 2] };
    expect(mar((i) => boca[i])).toBeCloseTo(0.4);
  });
});

describe('detector de fatiga (D60)', () => {
  it('ojos cerrados 1,5 s o más: una alerta por episodio', () => {
    const d = new DetectorFatiga();
    expect(serie(d, 0, 1400, cerrados)).toEqual([]);
    expect(serie(d, 1500, 4000, cerrados)).toEqual([{ t: 1500, a: 'OJOS_CERRADOS' }]);
    serie(d, 4100, 4200, abiertos);
    expect(serie(d, 4300, 5800, cerrados)).toEqual([{ t: 5800, a: 'OJOS_CERRADOS' }]);
  });

  it('un parpadeo largo (menos de 1,5 s) no alerta', () => {
    const d = new DetectorFatiga();
    expect(serie(d, 0, 1300, cerrados)).toEqual([]);
    expect(serie(d, 1400, 1500, abiertos)).toEqual([]);
    expect(serie(d, 1600, 2800, cerrados)).toEqual([]);
  });

  it('perder el rostro corta el episodio de ojos cerrados', () => {
    const d = new DetectorFatiga();
    serie(d, 0, 1000, cerrados);
    serie(d, 1100, 1200, null);
    expect(serie(d, 1300, 2700, cerrados)).toEqual([]);
  });

  it('3 bostezos de 1 s o más en 2 minutos', () => {
    const d = new DetectorFatiga();
    expect(serie(d, 0, 1500, bostezo)).toEqual([]);
    serie(d, 1600, 2000, abiertos);
    expect(serie(d, 30_000, 31_500, bostezo)).toEqual([]);
    serie(d, 31_600, 32_000, abiertos);
    expect(d.bostezosRecientes(32_000)).toBe(2);
    expect(serie(d, 60_000, 61_500, bostezo)).toEqual([{ t: 61_000, a: 'BOSTEZOS' }]);
    expect(d.bostezosRecientes(61_500)).toBe(0);
  });

  it('los bostezos fuera de la ventana de 2 minutos no cuentan; abrir la boca un instante tampoco', () => {
    const d = new DetectorFatiga();
    serie(d, 0, 1200, bostezo);
    serie(d, 1300, 1400, abiertos);
    serie(d, 10_000, 11_200, bostezo);
    serie(d, 11_300, 11_400, abiertos);
    expect(serie(d, 130_000, 131_200, bostezo)).toEqual([]);
    serie(d, 131_300, 131_400, abiertos);
    expect(serie(d, 140_000, 140_500, bostezo)).toEqual([]);
    expect(d.bostezosRecientes(140_500)).toBe(1);
  });
});
