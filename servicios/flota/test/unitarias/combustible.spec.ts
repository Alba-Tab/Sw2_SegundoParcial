import { detectarCaida, inicioDeParada, type Lectura } from '../../src/dominio/combustible/caida';
import { validarCarga } from '../../src/dominio/combustible/carga';
import type { Unidad } from '../../src/dominio/unidad/unidad';

const t0 = Date.parse('2026-11-03T14:00:00Z');
const l = (seg: number, nivelPct: number, velocidadKmh = 0): Lectura => ({
  placa: '4521KTR',
  nivelPct,
  velocidadKmh,
  medidoEn: new Date(t0 + seg * 1000).toISOString(),
});

describe('Caída de combustible (spec 009, D08)', () => {
  it('escenario robo: detenido, baja 2 puntos cada 10 s y se detecta a los 40 s (8 puntos)', () => {
    const lecturas = [l(-20, 51, 60), l(-10, 50, 0), l(0, 50), l(10, 48), l(20, 46), l(30, 44)];
    expect(detectarCaida(lecturas, l(30, 44))).toBeNull();
    expect(detectarCaida(lecturas, l(40, 42))).toEqual({ nivelAnteriorPct: 50, nivelActualPct: 42, caidaPct: 8, ventanaMinutos: 0.83 });
    expect(inicioDeParada(lecturas, l(40, 42))).toBe(l(-10, 0).medidoEn);
  });

  it('no detecta en marcha, con 6 puntos detenido ni con lecturas de antes de moverse', () => {
    expect(detectarCaida([l(0, 60, 50)], l(10, 50, 50))).toBeNull();
    expect(detectarCaida([l(0, 50), l(300, 47)], l(590, 44))).toBeNull();
    expect(detectarCaida([l(0, 60), l(10, 59, 40)], l(20, 50))).toBeNull();
    expect(detectarCaida([l(0, 50)], l(700, 40))).toBeNull(); // fuera de la ventana de 10 min
  });
});

describe('Carga de combustible (spec 009)', () => {
  const tracto = {
    unidadId: 't',
    tipoUnidad: 'TRACTO',
    placa: '4521KTR',
    estado: 'EN_VIAJE',
    kilometraje: 184000,
    kmDesdeUltimoMantenimiento: 0,
    documentos: [],
    atributos: { capacidadTanqueLitros: 600 },
  } as Unidad;
  const ahora = new Date('2026-11-03T14:00:00Z');
  const carga = { litros: 180.5, monto: { monto: '675.07', moneda: 'BOB' }, kilometraje: 184320, registradaEn: '2026-11-03T13:59:00Z' };

  it('valida tanque, odómetro, monto y hora', () => {
    expect(() => validarCarga(tracto, carga, ahora)).not.toThrow();
    expect(() => validarCarga(tracto, { ...carga, litros: 650 }, ahora)).toThrow(
      expect.objectContaining({ codigo: 'CARGA_EXCEDE_TANQUE' }),
    );
    expect(() => validarCarga(tracto, { ...carga, kilometraje: 183999 }, ahora)).toThrow(
      expect.objectContaining({ codigo: 'KILOMETRAJE_INVALIDO' }),
    );
    expect(() => validarCarga(tracto, { ...carga, monto: { monto: '0.00', moneda: 'BOB' } }, ahora)).toThrow(
      expect.objectContaining({ codigo: 'VALIDACION' }),
    );
    expect(() => validarCarga(tracto, { ...carga, registradaEn: '2026-11-03T14:05:00Z' }, ahora)).toThrow(
      expect.objectContaining({ codigo: 'VALIDACION' }),
    );
  });
});
