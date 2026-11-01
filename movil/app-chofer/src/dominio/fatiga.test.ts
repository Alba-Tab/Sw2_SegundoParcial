import { describe, expect, it } from 'vitest';
import { DetectorFatiga, type Medidas } from './fatiga';

const abiertos: Medidas = { ojos: 0.1, boca: 0.1, cabeceo: 0, alto: 0.3 };
const cerrados: Medidas = { ...abiertos, ojos: 0.9 };
const bostezo: Medidas = { ...abiertos, boca: 0.8 };

/** Cuadros cada 100 ms desde `desde` hasta `hasta` (incluido); devuelve las alertas. */
function serie(d: DetectorFatiga, desde: number, hasta: number, m: Medidas | null) {
  const alertas = [];
  for (let t = desde; t <= hasta; t += 100) {
    const a = d.muestra(t, m);
    if (a) alertas.push({ t, a });
  }
  return alertas;
}

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

  it('perder el rostro 0,5 s o más corta el episodio de ojos cerrados', () => {
    const d = new DetectorFatiga();
    serie(d, 0, 1000, cerrados);
    serie(d, 1100, 1500, null);
    expect(serie(d, 1600, 3000, cerrados)).toEqual([]);
    expect(serie(d, 3100, 3100, cerrados)).toEqual([{ t: 3100, a: 'OJOS_CERRADOS' }]);
  });

  it('un hueco sin rostro de menos de 0,5 s no reinicia el episodio (sigue contando desde que se cerraron)', () => {
    const d = new DetectorFatiga();
    expect(serie(d, 0, 1000, cerrados)).toEqual([]);
    expect(serie(d, 1100, 1400, null)).toEqual([]);
    expect(serie(d, 1500, 1500, cerrados)).toEqual([{ t: 1500, a: 'OJOS_CERRADOS' }]);
  });

  it('un bostezo con un cuadro perdido en medio sigue contando', () => {
    const d = new DetectorFatiga();
    serie(d, 0, 500, bostezo);
    serie(d, 600, 700, null);
    serie(d, 800, 1000, bostezo);
    serie(d, 1100, 1200, abiertos);
    expect(d.bostezosRecientes(1200)).toBe(1);
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

  it('sin rostro 3 s (gorra, mano, mirada fuera): una alerta hasta que vuelve el rostro', () => {
    const d = new DetectorFatiga();
    serie(d, 0, 500, abiertos);
    expect(serie(d, 600, 3500, null)).toEqual([]);
    expect(serie(d, 3600, 8000, null)).toEqual([{ t: 3600, a: 'SIN_ROSTRO' }]);
    serie(d, 8100, 8200, abiertos);
    expect(serie(d, 8300, 11_300, null)).toEqual([{ t: 11_300, a: 'SIN_ROSTRO' }]);
  });

  it('PERCLOS: parpadeos lentos que suman más del 30 % del minuto, sin llegar a 1,5 s seguidos', () => {
    const d = new DetectorFatiga();
    const alertas = [];
    // Ciclos de 3 s: 1 s cerrados y 2 s abiertos (33 %).
    for (let t = 0; t < 40_000; t += 3000) {
      alertas.push(...serie(d, t, t + 900, cerrados), ...serie(d, t + 1000, t + 2900, abiertos));
    }
    expect(alertas.map((x) => x.a)).toEqual(['SOMNOLENCIA']);
    expect(alertas[0].t).toBeGreaterThanOrEqual(30_000);
  });

  it('parpadeo normal (10 %) no es somnolencia', () => {
    const d = new DetectorFatiga();
    const alertas = [];
    for (let t = 0; t < 70_000; t += 3000) {
      alertas.push(...serie(d, t, t + 200, cerrados), ...serie(d, t + 300, t + 2900, abiertos));
    }
    expect(alertas).toEqual([]);
  });

  it('cabeceo: la cabeza cae 20° respecto de su posición habitual durante 1 s', () => {
    const d = new DetectorFatiga();
    // El celular va más abajo que la cara: 15° de base no es cabeceo.
    expect(serie(d, 0, 5000, { ...abiertos, cabeceo: 15 })).toEqual([]);
    expect(serie(d, 5100, 5900, { ...abiertos, cabeceo: 40 })).toEqual([]);
    expect(serie(d, 6000, 8000, { ...abiertos, cabeceo: 40 })).toEqual([{ t: 6100, a: 'CABECEO' }]);
  });

  it('ojos tapados: el rostro se encoge de golpe a la mitad y a los 3 s cuenta como no visible', () => {
    const d = new DetectorFatiga();
    serie(d, 0, 2000, abiertos);
    const tapado = { ...abiertos, alto: 0.15 };
    expect(serie(d, 2100, 5000, tapado)).toEqual([]);
    expect(serie(d, 5100, 6000, tapado)).toEqual([{ t: 5100, a: 'SIN_ROSTRO' }]);
  });

  it('alejarse despacio del celular no cuenta como rostro tapado', () => {
    const d = new DetectorFatiga();
    const alertas = [];
    for (let t = 0, alto = 0.3; t < 60_000; t += 100, alto *= 0.9995) alertas.push(...serie(d, t, t, { ...abiertos, alto }));
    expect(alertas).toEqual([]);
  });

  it('se recuesta y se queda así: una alerta de rostro no visible y a los 10 s vuelve a vigilar', () => {
    const d = new DetectorFatiga();
    serie(d, 0, 2000, abiertos);
    const lejos = { ...abiertos, alto: 0.16 };
    expect(serie(d, 2100, 15_000, lejos).map((x) => x.a)).toEqual(['SIN_ROSTRO']);
    expect(d.rostroVisible).toBe(true);
    expect(serie(d, 15_100, 17_000, { ...lejos, ojos: 0.9 })).toEqual([{ t: 16_600, a: 'OJOS_CERRADOS' }]);
  });

  it('cabeceo lento (10°/s a 30 cuadros por segundo) también alerta', () => {
    const d = new DetectorFatiga();
    const alertas = [];
    for (let t = 0; t < 5000; t += 33) alertas.push(...serie(d, t, t, abiertos));
    for (let t = 5000, g = 0; t < 12_000; t += 33, g = Math.min(45, g + 0.33)) {
      const a = d.muestra(t, { ...abiertos, cabeceo: g });
      if (a) alertas.push(a);
    }
    expect(alertas).toEqual(['CABECEO']);
  });

  it('baja la cabeza 25° y se queda así: una alerta, y a los 30 s vuelve a vigilar desde la nueva postura', () => {
    const d = new DetectorFatiga();
    serie(d, 0, 3000, abiertos);
    const abajo = { ...abiertos, cabeceo: 25 };
    expect(serie(d, 3100, 60_000, abajo).map((x) => x.a)).toEqual(['CABECEO']);
    expect(serie(d, 60_100, 62_000, { ...abiertos, cabeceo: 50 })).toEqual([{ t: 61_100, a: 'CABECEO' }]);
  });

  it('el tamaño habitual sale de los primeros 2 s: acercarse al abrir y luego acomodarse no es rostro tapado', () => {
    const d = new DetectorFatiga();
    serie(d, 0, 300, { ...abiertos, alto: 0.5 });
    const alertas = serie(d, 400, 10_000, abiertos);
    expect(alertas).toEqual([]);
  });
});
