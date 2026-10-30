import { describe, expect, it } from 'vitest';
import { enOrden, type Operacion, siguiente } from './operacion';
import { decidir, espera, ESPERA_MAXIMA_MS } from './reintento';
import { esPositivo, normalizarMonto } from './dinero';
import { estadoVisible, puedeIniciar, type ViajeLocal, viajesQueSobran } from './viaje';

const op = (o: Partial<Operacion>): Operacion => ({
  opId: o.opId ?? 'x',
  viajeId: 'v',
  tipo: 'HITO',
  cuerpo: {},
  creadaEn: '2026-11-03T12:00:00Z',
  intentos: 0,
  proximoIntentoEn: null,
  estado: 'PENDIENTE',
  codigoError: null,
  cerradaEn: null,
  evidencias: [],
  ...o,
});

describe('cola (spec 005)', () => {
  it('el inicio sale primero, luego hitos y eventos por hora de creación y la entrega al final', () => {
    const ops = [
      op({ opId: 'entrega', tipo: 'ENTREGA', creadaEn: '2026-11-03T12:00:00Z' }),
      op({ opId: 'h2', creadaEn: '2026-11-03T12:05:00Z' }),
      op({ opId: 'frenada', tipo: 'EVENTO_CONDUCCION', creadaEn: '2026-11-03T12:01:00Z' }),
      op({ opId: 'inicio', tipo: 'INICIO', creadaEn: '2026-11-03T12:10:00Z' }),
    ];
    expect(enOrden(ops).map((o) => o.opId)).toEqual(['inicio', 'frenada', 'h2', 'entrega']);
  });

  it('si la primera espera su reintento, el viaje espera; las confirmadas y fallidas no cuentan', () => {
    const ahora = new Date('2026-11-03T12:00:00Z');
    const ops = [
      op({ opId: 'a', tipo: 'INICIO', proximoIntentoEn: '2026-11-03T12:00:05Z' }),
      op({ opId: 'b', creadaEn: '2026-11-03T12:01:00Z' }),
    ];
    expect(siguiente(ops, ahora)).toBeNull();
    expect(siguiente(ops, new Date('2026-11-03T12:00:06Z'))?.opId).toBe('a');
    ops[0].estado = 'CONFIRMADA';
    expect(siguiente(ops, ahora)?.opId).toBe('b');
  });
});

describe('reintentos (spec 005)', () => {
  it('full jitter: base 1 s, ×2, máximo 5 min', () => {
    expect(espera(1, () => 0.999)).toBe(999);
    expect(espera(3, () => 0.5)).toBe(2000);
    expect(espera(30, () => 1)).toBe(ESPERA_MAXIMA_MS);
    expect(espera(4, () => 0)).toBe(0);
  });

  it('decide por estado y código; Retry-After manda', () => {
    expect(decidir({ estado: 200 }, 1)).toEqual({ tipo: 'CONFIRMADA' });
    expect(decidir({ estado: 'SIN_RED' }, 2, () => 0.5)).toEqual({ tipo: 'REINTENTAR', esperaMs: 1000 });
    expect(decidir({ estado: 503, reintentarEnSegundos: 10 }, 1)).toEqual({ tipo: 'REINTENTAR', esperaMs: 10_000 });
    expect(decidir({ estado: 429 }, 1, () => 0).tipo).toBe('REINTENTAR');
    expect(decidir({ estado: 409, codigo: 'CONFIRMACION_EN_CURSO' }, 1).tipo).toBe('REINTENTAR');
    expect(decidir({ estado: 409, codigo: 'IDEMPOTENCIA_EN_PROCESO' }, 1).tipo).toBe('REINTENTAR');
    expect(decidir({ estado: 409, codigo: 'CONFLICTO_ESTADO' }, 1)).toEqual({ tipo: 'CONFLICTO' });
    expect(decidir({ estado: 422, codigo: 'IDEMPOTENCIA_CUERPO_DISTINTO' }, 1)).toEqual({
      tipo: 'FALLIDA',
      codigo: 'IDEMPOTENCIA_CUERPO_DISTINTO',
    });
    expect(decidir({ estado: 403 }, 1)).toEqual({ tipo: 'FALLIDA', codigo: 'HTTP_403' });
    expect(decidir({ estado: 401 }, 1)).toEqual({ tipo: 'SESION' });
  });
});

describe('viaje local', () => {
  const v = (o: Partial<ViajeLocal>): ViajeLocal => ({
    viajeId: 'a',
    estado: 'CONFIRMADO',
    iniciadoLocal: false,
    canceladoAlSincronizar: false,
    entregaLocal: null,
    cliente: 'Agroexport',
    ruta: 'Aula',
    destino: { lat: 0, lng: 0, radioMetros: 300 },
    tipoCarga: 'GRANOS',
    toneladas: 28,
    fechaViaje: '2026-11-03',
    placa: '4521KTR',
    ...o,
  });

  it('en ruta desde que se pulsa iniciar; un solo viaje en ruta', () => {
    const a = v({ iniciadoLocal: true });
    expect(estadoVisible(a)).toBe('EN_RUTA');
    expect(puedeIniciar(v({ viajeId: 'b' }), [a])).toBe(false);
    expect(puedeIniciar(v({ viajeId: 'b' }), [v({ viajeId: 'c', estado: 'CERRADO' })])).toBe(true);
    expect(estadoVisible(v({ canceladoAlSincronizar: true, iniciadoLocal: true }))).toBe('CANCELADO');
  });
});

describe('monto escrito por el chofer (000 §3, sin float)', () => {
  it('acepta punto o coma y hasta 2 decimales, y lo deja como el contrato lo pide', () => {
    expect(normalizarMonto('675.07')).toBe('675.07');
    expect(normalizarMonto('675,5')).toBe('675.50');
    expect(normalizarMonto(' 1200 ')).toBe('1200.00');
    expect(normalizarMonto('007,10')).toBe('7.10');
    expect(normalizarMonto('0')).toBe('0.00');
    expect(normalizarMonto('999999999999,99')).toBe('999999999999.99');
  });

  it('rechaza lo que no es un monto', () => {
    for (const t of ['', '1.234', '1,2,3', '-5', '+5', '1e3', '.5', '5.', '1 200', '1234567890123', 'NaN']) {
      expect(normalizarMonto(t)).toBeNull();
    }
  });

  it('mayor que cero sin convertirlo a número', () => {
    expect(esPositivo('0.00')).toBe(false);
    expect(esPositivo('0.01')).toBe(true);
  });
});

describe('viajes que sobran al bajar /viajes/mios (D50)', () => {
  it('se borran los que el servidor ya no devuelve, salvo los que tienen operaciones por enviar', () => {
    expect(viajesQueSobran(['a', 'b', 'c', 'd'], ['a'], ['c'])).toEqual(['b', 'd']);
    expect(viajesQueSobran(['a'], [], [])).toEqual(['a']);
    expect(viajesQueSobran([], ['a'], [])).toEqual([]);
  });
});
