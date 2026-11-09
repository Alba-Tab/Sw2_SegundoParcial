import { cerrar, programar } from '../../src/dominio/mantenimiento/mantenimiento';
import { darDeBaja, editarUnidad, nuevaUnidad, type UnidadNueva } from '../../src/dominio/unidad/gestion';
import type { Unidad } from '../../src/dominio/unidad/unidad';
import { msHastaLaRevision } from '../../src/infraestructura/programacion/revision-diaria';

const HOY = '2026-11-03';
const docs = (soat = '2027-05-01') => [
  { tipo: 'SOAT' as const, venceEl: soat },
  { tipo: 'INSPECCION_TECNICA' as const, venceEl: '2027-04-01' },
];
const codigo = (f: () => unknown) => {
  try {
    f();
    return 'OK';
  } catch (e) {
    return `${(e as { codigo: string }).codigo} ${JSON.stringify((e as { datos?: unknown }).datos ?? {})}`;
  }
};
const cisterna: UnidadNueva = {
  tipoUnidad: 'REMOLQUE',
  placa: '5002CIS',
  tipoRemolque: 'CISTERNA',
  capacidadToneladas: 28,
  kmDesdeUltimoMantenimiento: 0,
  documentos: docs(),
  atributos: { compartimentos: 3, capacidadLitros: 30000 },
};

describe('Alta, edición y baja de unidades (spec 010, A)', () => {
  it('FF4: cada tipo con sus atributos; un campo de otro tipo o fuera de rango es VALIDACION', () => {
    expect(nuevaUnidad(cisterna, 'c', HOY).unidad).toMatchObject({ estado: 'DISPONIBLE', atributos: { compartimentos: 3 } });
    const furgon = { ...cisterna, tipoRemolque: 'FURGON' as const, atributos: { volumenM3: 85 } };
    expect(nuevaUnidad(furgon, 'f', HOY).unidad.atributos).toEqual({ volumenM3: 85 });
    expect(codigo(() => nuevaUnidad({ ...furgon, atributos: { volumenM3: 85, compartimentos: 3 } }, 'f', HOY))).toBe(
      'VALIDACION {"campo":"atributos.compartimentos"}',
    );
    expect(codigo(() => nuevaUnidad({ ...cisterna, atributos: { compartimentos: 2.5, capacidadLitros: 30000 } }, 'c', HOY))).toBe(
      'VALIDACION {"campo":"atributos.compartimentos"}',
    );
    // Campos del prototipo de Object (D76): no son atributos de ningún tipo.
    for (const campo of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const atributos = JSON.parse(`{"volumenM3": 85, "${campo}": {"$gt": ""}}`) as Record<string, unknown>;
      expect(codigo(() => nuevaUnidad({ ...furgon, atributos }, 'f', HOY))).toBe(`VALIDACION {"campo":"atributos.${campo}"}`);
    }
    const tracto: UnidadNueva = {
      tipoUnidad: 'TRACTO',
      placa: '9001TRA',
      kilometraje: 1000,
      kmDesdeUltimoMantenimiento: 0,
      documentos: docs(),
      atributos: { capacidadTanqueLitros: 600 },
    };
    expect(nuevaUnidad(tracto, 't', HOY).unidad).toMatchObject({ kilometraje: 1000, estado: 'DISPONIBLE' });
    expect(codigo(() => nuevaUnidad({ ...tracto, atributos: { capacidadTanqueLitros: 2000 } }, 't', HOY))).toMatch(/^VALIDACION/);
    expect(codigo(() => nuevaUnidad({ ...tracto, capacidadToneladas: 10 }, 't', HOY))).toMatch(/capacidadToneladas/);
    expect(codigo(() => nuevaUnidad({ ...cisterna, kilometraje: 10 }, 'c', HOY))).toMatch(/kilometraje/);
    expect(codigo(() => nuevaUnidad({ ...cisterna, capacidadToneladas: undefined }, 'c', HOY))).toMatch(/capacidadToneladas/);
    expect(codigo(() => nuevaUnidad({ ...cisterna, documentos: [docs()[0], docs()[0]] }, 'c', HOY))).toMatch(/documentos/);
  });

  it('nace MANTENIMIENTO_PENDIENTE si ya cumple la regla C', () => {
    const r = nuevaUnidad({ ...cisterna, kmDesdeUltimoMantenimiento: 10000 }, 'c', HOY);
    expect(r.unidad.estado).toBe('MANTENIMIENTO_PENDIENTE');
    expect(r.revision.motivos).toEqual(['KILOMETRAJE']);
  });

  it('renovar el SOAT devuelve a DISPONIBLE; no se edita una unidad en viaje; la baja es final', () => {
    const u: Unidad = { ...nuevaUnidad({ ...cisterna, documentos: docs('2026-11-13') }, 'c', HOY).unidad };
    expect(u.estado).toBe('MANTENIMIENTO_PENDIENTE');
    const renovada = editarUnidad(u, { capacidadToneladas: 28, documentos: docs('2027-11-13'), atributos: u.atributos }, HOY);
    expect(renovada.estado).toBe('DISPONIBLE');
    expect(codigo(() => editarUnidad({ ...renovada, estado: 'EN_VIAJE' }, renovada, HOY))).toMatch(/^CONFLICTO_ESTADO/);
    const baja = darDeBaja(renovada, 'Vendida', new Date('2026-11-03T12:00:00Z'));
    expect(baja).toMatchObject({ estado: 'INACTIVA', baja: { motivo: 'Vendida' } });
    expect(codigo(() => darDeBaja(baja, 'otra vez', new Date()))).toMatch(/^CONFLICTO_ESTADO/);
    expect(codigo(() => editarUnidad(baja, renovada, HOY))).toMatch(/^CONFLICTO_ESTADO/);
  });
});

describe('Programar y cerrar (spec 010, E)', () => {
  const furgon: Unidad = {
    unidadId: 'f',
    tipoUnidad: 'REMOLQUE',
    placa: '3001FUR',
    tipoRemolque: 'FURGON',
    capacidadToneladas: 30,
    estado: 'MANTENIMIENTO_PENDIENTE',
    kmDesdeUltimoMantenimiento: 10070,
    documentos: docs(),
    atributos: { volumenM3: 85 },
  };
  const nuevo = {
    tipo: 'PREVENTIVO' as const,
    fechaProgramada: HOY,
    taller: 'Taller Norte',
    descripcion: 'Frenos',
    checklist: [{ item: 'Frenos' }, { item: 'Luces' }],
  };
  const ahora = new Date('2026-11-03T12:00:00Z');

  it('PREVENTIVO: EN_MANTENIMIENTO y, al cerrar con el checklist completo, DISPONIBLE con 0 km', () => {
    const p = programar(furgon, nuevo, 'm', HOY, ahora, 'sub-jefe');
    expect(p.unidad.estado).toBe('EN_MANTENIMIENTO');
    expect(p.mantenimiento).toMatchObject({ estado: 'EN_CURSO', checklist: [{ item: 'Frenos' }, { item: 'Luces' }] });
    const ok = [
      { item: 'Luces', ok: true },
      { item: 'Frenos', ok: true, nota: 'Pastillas nuevas' },
    ];
    const c = cerrar(p.mantenimiento, p.unidad, { checklist: ok }, HOY, ahora);
    expect(c.unidad).toMatchObject({ estado: 'DISPONIBLE', kmDesdeUltimoMantenimiento: 0 });
    expect(c.mantenimiento).toMatchObject({
      estado: 'CERRADO',
      checklist: [
        { item: 'Frenos', ok: true, nota: 'Pastillas nuevas' },
        { item: 'Luces', ok: true },
      ],
    });
    expect(codigo(() => cerrar(c.mantenimiento, p.unidad, { checklist: ok }, HOY, ahora))).toMatch(/^CONFLICTO_ESTADO/);
  });

  it('checklist incompleto o con ok = false, odómetro, fecha pasada y estado', () => {
    const p = programar(furgon, nuevo, 'm', HOY, ahora, 'sub-jefe');
    expect(codigo(() => cerrar(p.mantenimiento, p.unidad, { checklist: [{ item: 'Frenos', ok: true }] }, HOY, ahora))).toMatch(
      /falta|VALIDACION/,
    );
    const conFalla = [
      { item: 'Frenos', ok: true },
      { item: 'Luces', ok: false },
    ];
    expect(codigo(() => cerrar(p.mantenimiento, p.unidad, { checklist: conFalla }, HOY, ahora))).toMatch(/^VALIDACION/);
    const ok = conFalla.map((i) => ({ ...i, ok: true }));
    expect(codigo(() => cerrar(p.mantenimiento, p.unidad, { checklist: ok, kilometraje: 10 }, HOY, ahora))).toBe(
      'VALIDACION {"campo":"kilometraje"}',
    );
    const tracto: Unidad = { ...furgon, tipoUnidad: 'TRACTO', tipoRemolque: undefined, kilometraje: 184000, atributos: {} };
    const t = programar(tracto, nuevo, 'm', HOY, ahora, 'sub-jefe');
    expect(codigo(() => cerrar(t.mantenimiento, t.unidad, { checklist: ok }, HOY, ahora))).toBe('VALIDACION {"campo":"kilometraje"}');
    expect(codigo(() => cerrar(t.mantenimiento, t.unidad, { checklist: ok, kilometraje: 183000 }, HOY, ahora))).toMatch(
      /^KILOMETRAJE_INVALIDO/,
    );
    expect(cerrar(t.mantenimiento, t.unidad, { checklist: ok, kilometraje: 184100 }, HOY, ahora).unidad.kilometraje).toBe(184100);
    expect(codigo(() => programar(furgon, { ...nuevo, fechaProgramada: '2026-11-02' }, 'm', HOY, ahora, 's'))).toMatch(/fechaProgramada/);
    expect(codigo(() => programar({ ...furgon, estado: 'EN_VIAJE' }, nuevo, 'm', HOY, ahora, 's'))).toMatch(/^CONFLICTO_ESTADO/);
  });

  it('DOCUMENTOS no reinicia los km: sigue MANTENIMIENTO_PENDIENTE; los documentos renovados se aplican', () => {
    const conSoat = { ...furgon, kmDesdeUltimoMantenimiento: 100, documentos: docs('2026-11-10') };
    const p = programar(conSoat, { ...nuevo, tipo: 'DOCUMENTOS', checklist: [{ item: 'SOAT' }] }, 'm', HOY, ahora, 's');
    const sinRenovar = cerrar(p.mantenimiento, p.unidad, { checklist: [{ item: 'SOAT', ok: true }] }, HOY, ahora);
    expect(sinRenovar.unidad.estado).toBe('MANTENIMIENTO_PENDIENTE');
    expect(sinRenovar.revision.motivos).toEqual(['SOAT']);
    const renovado = cerrar(
      p.mantenimiento,
      p.unidad,
      { checklist: [{ item: 'SOAT', ok: true }], documentosRenovados: [{ tipo: 'SOAT', venceEl: '2027-11-10' }] },
      HOY,
      ahora,
    );
    expect(renovado.unidad).toMatchObject({ estado: 'DISPONIBLE', kmDesdeUltimoMantenimiento: 100 });
  });
});

describe('Revisión diaria (D75)', () => {
  it('a las 06:00 de La Paz (10:00 UTC), hoy o mañana', () => {
    expect(msHastaLaRevision(new Date('2026-11-03T09:00:00Z'))).toBe(3_600_000);
    expect(msHastaLaRevision(new Date('2026-11-03T10:00:00Z'))).toBe(86_400_000);
    expect(msHastaLaRevision(new Date('2026-11-03T23:00:00Z'))).toBe(11 * 3_600_000);
  });
});
