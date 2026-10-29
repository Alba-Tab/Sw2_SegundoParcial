import { choferHabilitado, type Chofer } from '../../src/dominio/unidad/chofer';
import { documentosVigentes, porPrioridad, remolqueCompatible, reservable, type Unidad } from '../../src/dominio/unidad/unidad';
import { aLiberar, confirmar } from '../../src/dominio/reserva/reserva-unidad';

const unidad = (u: Partial<Unidad>): Unidad => ({
  unidadId: 'u',
  tipoUnidad: 'REMOLQUE',
  placa: '1000AAA',
  tipoRemolque: 'FURGON',
  capacidadToneladas: 30,
  estado: 'DISPONIBLE',
  kmDesdeUltimoMantenimiento: 0,
  documentos: [
    { tipo: 'SOAT', venceEl: '2027-03-01' },
    { tipo: 'INSPECCION_TECNICA', venceEl: '2027-03-01' },
  ],
  atributos: {},
  ...u,
});

describe('Elección de unidad (spec 003, D11)', () => {
  it('cada carga lleva su remolque y la capacidad debe alcanzar', () => {
    expect(remolqueCompatible(unidad({}), 'GRANOS', 28)).toBe(true);
    expect(remolqueCompatible(unidad({ tipoRemolque: 'PLATAFORMA' }), 'GRANOS', 28)).toBe(false);
    expect(remolqueCompatible(unidad({ tipoRemolque: 'PLATAFORMA' }), 'INSUMOS', 10)).toBe(true);
    expect(remolqueCompatible(unidad({ tipoRemolque: 'CISTERNA' }), 'INSUMOS_LIQUIDOS', 20)).toBe(true);
    expect(remolqueCompatible(unidad({ tipoRemolque: 'PLATAFORMA' }), 'CONTENEDOR', 25)).toBe(true);
    expect(remolqueCompatible(unidad({ capacidadToneladas: 20 }), 'GRANOS', 28)).toBe(false);
    expect(remolqueCompatible(unidad({ tipoUnidad: 'TRACTO', tipoRemolque: undefined }), 'GRANOS', 1)).toBe(false);
  });

  it('solo se reserva DISPONIBLE con SOAT e inspección vigentes el día del viaje', () => {
    expect(reservable(unidad({}), '2026-11-10')).toBe(true);
    expect(reservable(unidad({ estado: 'MANTENIMIENTO_PENDIENTE' }), '2026-11-10')).toBe(false);
    const soatVencido = unidad({
      documentos: [
        { tipo: 'SOAT', venceEl: '2026-11-09' },
        { tipo: 'INSPECCION_TECNICA', venceEl: '2027-01-01' },
      ],
    });
    expect(documentosVigentes(soatVencido, '2026-11-10')).toBe(false);
    expect(documentosVigentes(unidad({ documentos: [{ tipo: 'SOAT', venceEl: '2027-01-01' }] }), '2026-11-10')).toBe(false);
  });

  it('primero la de más km desde su último mantenimiento; desempate por placa', () => {
    const lista = [
      unidad({ placa: '3000CCC', kmDesdeUltimoMantenimiento: 100 }),
      unidad({ placa: '2000BBB', kmDesdeUltimoMantenimiento: 9950 }),
      unidad({ placa: '1000AAA', kmDesdeUltimoMantenimiento: 100 }),
    ].sort(porPrioridad);
    expect(lista.map((u) => u.placa)).toEqual(['2000BBB', '1000AAA', '3000CCC']);
  });

  it('chofer activo, libre y con licencia C vigente', () => {
    const c: Chofer = {
      choferId: 'c',
      nombre: 'Juan Mamani',
      usuarioSub: 's',
      licenciaCategoria: 'C',
      licenciaVenceEl: '2027-01-01',
      activo: true,
      disponible: true,
    };
    expect(choferHabilitado(c, '2026-11-10')).toBe(true);
    expect(choferHabilitado({ ...c, licenciaCategoria: 'B' }, '2026-11-10')).toBe(false);
    expect(choferHabilitado({ ...c, licenciaVenceEl: '2026-11-09' }, '2026-11-10')).toBe(false);
    expect(choferHabilitado({ ...c, disponible: false }, '2026-11-10')).toBe(false);
  });

  it('una reserva liberada no se confirma ni devuelve unidades dos veces', () => {
    const r = {
      reservaUnidadId: 'r',
      servicioId: 's',
      tractoId: 't',
      remolqueId: 'm',
      choferId: 'c',
      estado: 'PROVISIONAL' as const,
      creadaEn: new Date(),
    };
    expect(confirmar(r).estado).toBe('CONFIRMADA');
    expect(aLiberar(r)).toEqual({ unidades: ['t', 'm'], choferId: 'c' });
    expect(aLiberar({ ...r, estado: 'LIBERADA' })).toEqual({ unidades: [] });
    expect(() => confirmar({ ...r, estado: 'LIBERADA' })).toThrow('ya se liberó');
  });
});
