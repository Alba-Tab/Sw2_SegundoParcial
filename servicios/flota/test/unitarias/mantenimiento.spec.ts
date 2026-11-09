import { liberarDespuesDelViaje, revisar } from '../../src/dominio/unidad/mantenimiento';
import type { Unidad } from '../../src/dominio/unidad/unidad';

const furgon = (u: Partial<Unidad> = {}): Unidad => ({
  unidadId: 'f1',
  tipoUnidad: 'REMOLQUE',
  placa: '2210KDN',
  tipoRemolque: 'FURGON',
  capacidadToneladas: 30,
  estado: 'EN_VIAJE',
  kmDesdeUltimoMantenimiento: 9950,
  documentos: [
    { tipo: 'SOAT', venceEl: '2027-05-01' },
    { tipo: 'INSPECCION_TECNICA', venceEl: '2027-04-01' },
  ],
  atributos: { volumenM3: 90 },
  ...u,
});

describe('Regla de mantenimiento (spec 010, D07)', () => {
  it('FF3: el furgón de 9.950 km que entrega en el Aula (+120) queda con 10.070 y MANTENIMIENTO_PENDIENTE', () => {
    const r = liberarDespuesDelViaje(furgon(), 120, '2026-11-03');
    expect(r?.unidad).toMatchObject({ kmDesdeUltimoMantenimiento: 10070, estado: 'MANTENIMIENTO_PENDIENTE' });
    expect(r?.revision.motivos).toEqual(['KILOMETRAJE']);
  });

  it('SOAT o inspección que vencen en 15 días o menos; el vencimiento más cercano', () => {
    const r = revisar(
      furgon({
        kmDesdeUltimoMantenimiento: 100,
        documentos: [
          { tipo: 'SOAT', venceEl: '2026-11-13' },
          { tipo: 'INSPECCION_TECNICA', venceEl: '2026-11-18' },
        ],
      }),
      '2026-11-03',
    );
    expect(r).toEqual({ motivos: ['SOAT', 'INSPECCION'], documentoVenceEl: '2026-11-13' });
    expect(revisar(furgon({ kmDesdeUltimoMantenimiento: 100 }), '2026-11-03').motivos).toEqual([]);
  });

  it('desde RESERVADA (la entrega llegó antes que ViajeIniciado) también libera; otro estado no', () => {
    expect(liberarDespuesDelViaje(furgon({ estado: 'RESERVADA', kmDesdeUltimoMantenimiento: 0 }), 120, '2026-11-03')?.unidad.estado).toBe(
      'DISPONIBLE',
    );
    expect(liberarDespuesDelViaje(furgon({ estado: 'DISPONIBLE' }), 120, '2026-11-03')).toBeNull();
  });
});
