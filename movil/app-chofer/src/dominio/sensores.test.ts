import { describe, expect, it } from 'vitest';
import { DetectorFrenadas } from './frenada';
import { descripcionValida, puedeEscribir } from './hito';
import { agregarLectura, kmh, type Lectura, metros, MuestreoGps, velocidadEstimada } from './muestreo';

const l = (en: number, lat: number, lng = -63.18): Lectura => ({ lat, lng, velocidadMs: 15, precisionMetros: 5, en });

describe('muestreo GPS (D52)', () => {
  it('un punto cada 20 s o cada 100 m, lo que ocurra primero', () => {
    const m = new MuestreoGps();
    expect(m.aceptar(l(0, -17.7))).toBe(true);
    expect(m.aceptar(l(10_000, -17.7003))).toBe(false); // 33 m en 10 s
    expect(m.aceptar(l(15_000, -17.701))).toBe(true); // 111 m
    expect(m.aceptar(l(34_000, -17.701))).toBe(false);
    expect(m.aceptar(l(35_000, -17.701))).toBe(true); // 20 s
  });

  it('haversine y km/h', () => {
    expect(Math.round(metros({ lat: -17.7, lng: -63.18 }, { lat: -17.701, lng: -63.18 }))).toBe(111);
    expect(kmh(15)).toBe(54);
    expect(kmh(-1)).toBe(0);
  });
});

describe('frenadas (D08, D59)', () => {
  it('0,4 g o más sostenida 300 ms a más de 20 km/h, con el pico como magnitud', () => {
    const d = new DetectorFrenadas();
    expect(d.muestra(0, 0.45, 60)).toBeNull();
    expect(d.muestra(100, 0.6, 60)).toBeNull();
    expect(d.muestra(200, 0.5, 60)).toBeNull();
    expect(d.muestra(300, 0.42, 60)).toBe(0.6);
  });

  it('no cuenta un golpe corto, una frenada lenta ni a poca velocidad', () => {
    const d = new DetectorFrenadas();
    expect([0, 100, 200].map((t) => d.muestra(t, 0.5, 60))).toEqual([null, null, null]);
    expect(d.muestra(300, 0.2, 60)).toBeNull();
    expect([400, 500, 600, 700].map((t) => d.muestra(t, 0.5, 15))).toEqual([null, null, null, null]);
  });

  it('una por cada 10 s', () => {
    const d = new DetectorFrenadas();
    const serie = (desde: number) => [0, 100, 200, 300].map((t) => d.muestra(desde + t, 0.5, 60)).filter((x) => x !== null);
    expect(serie(0)).toEqual([0.5]);
    expect(serie(1000)).toEqual([]);
    expect(serie(10_400)).toEqual([0.5]);
  });
});

describe('bitácora (D58)', () => {
  it('a más de 5 km/h solo se dicta; la descripción va de 3 a 500 caracteres', () => {
    expect(puedeEscribir(5)).toBe(true);
    expect(puedeEscribir(5.1)).toBe(false);
    expect(descripcionValida('  ok ')).toBe(false);
    expect(descripcionValida('Bloqueo')).toBe(true);
    expect(descripcionValida('x'.repeat(501))).toBe(false);
  });
});

describe('velocidad estimada cuando el GPS no la da (E2-3)', () => {
  // Sin velocidad del GPS (-1) y con 5 m de precisión; 0,001° de latitud son 111,2 m.
  const sin = (en: number, lat: number, precisionMetros = 5): Lectura => ({ lat, lng: -63.18, velocidadMs: -1, precisionMetros, en });
  const juntar = (...ls: Lectura[]) => ls.reduce(agregarLectura, [] as Lectura[]);

  it('usa una lectura de 5 s antes o más; con lecturas más juntas no se sabe', () => {
    expect(velocidadEstimada(juntar(sin(0, -17.7), sin(3000, -17.7003)), 3000)).toBeNull();
    // 0, 3 y 6 s: la de 6 s se compara con la de 0 s (111,2 m en 6 s).
    expect(velocidadEstimada(juntar(sin(0, -17.7), sin(3000, -17.7005), sin(6000, -17.701)), 6000)).toBe(66.7);
  });

  it('solo guarda una lectura anterior a los últimos 5 s', () => {
    expect(juntar(sin(0, -17.7), sin(2000, -17.7), sin(4000, -17.7), sin(6000, -17.7), sin(7000, -17.7)).map((x) => x.en)).toEqual([
      2000, 4000, 6000, 7000,
    ]);
  });

  it('un desplazamiento menor que la precisión es ruido del camión parado: 0, no 10 km/h', () => {
    // 27,8 m en 10 s serían 10 km/h; con 30 m de precisión en una de las lecturas no se sabe si se movió.
    expect(velocidadEstimada(juntar(sin(0, -17.7, 30), sin(10_000, -17.70025, 5)), 10_000)).toBe(0);
    expect(velocidadEstimada(juntar(sin(0, -17.7, 5), sin(10_000, -17.70025, 5)), 10_000)).toBe(10);
  });
});
