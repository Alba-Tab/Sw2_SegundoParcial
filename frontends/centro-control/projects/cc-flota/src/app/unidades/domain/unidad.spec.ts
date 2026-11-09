import { filtrar } from 'ui-comun/dominio';
import {
  checklistCompleto,
  claseUnidad,
  edicionDesde,
  mensajeUnidad,
  motivoBloqueo,
  nuevaUnidadDesde,
  PLACA,
  urgenciaUnidad,
  checklistValido,
  cierreInicial,
  documentosEnAviso,
  lineasChecklist,
  puedeProgramar,
  textoUnidad,
  type Mantenimiento,
  type Unidad,
} from './unidad';

describe('unidades (dominio)', () => {
  it('el checklist es una línea por ítem, sin líneas vacías', () => {
    expect(lineasChecklist('Aceite y filtros\n  Frenos \n\nLuces\n')).toEqual(['Aceite y filtros', 'Frenos', 'Luces']);
  });

  it('checklist de 1 a 30 líneas de hasta 120 caracteres (E-19)', () => {
    expect(checklistValido('')).toBe(false);
    expect(checklistValido(Array.from({ length: 30 }, (_, i) => `Ítem ${i}`).join('\n'))).toBe(true);
    expect(checklistValido(Array.from({ length: 31 }, (_, i) => `Ítem ${i}`).join('\n'))).toBe(false);
    expect(checklistValido('x'.repeat(120))).toBe(true);
    expect(checklistValido('x'.repeat(121))).toBe(false);
  });

  it('spec 010: solo se cierra con todos los ítems hechos', () => {
    expect(checklistCompleto([{ item: 'Frenos', ok: true }])).toBe(true);
    expect(
      checklistCompleto([
        { item: 'Frenos', ok: true },
        { item: 'Luces', ok: false },
      ]),
    ).toBe(false);
    expect(checklistCompleto([])).toBe(false);
  });

  it('al cerrar, cada ítem empieza marcado como hecho', () => {
    const m = { checklist: [{ item: 'Frenos', ok: null, nota: null }] } as unknown as Mantenimiento;
    expect(cierreInicial(m)).toEqual([{ item: 'Frenos', ok: true }]);
  });

  it('spec 010: se programa con la unidad disponible o con el aviso pendiente', () => {
    expect(puedeProgramar('DISPONIBLE')).toBe(true);
    expect(puedeProgramar('MANTENIMIENTO_PENDIENTE')).toBe(true);
    expect(puedeProgramar('EN_VIAJE')).toBe(false);
  });

  it('la búsqueda encuentra por placa y por el tipo como se lee en pantalla, sin tildes', () => {
    const u = [
      { placa: 'ABC-123', tipoUnidad: 'TRACTO', tipoRemolque: null },
      { placa: 'R-77', tipoUnidad: 'REMOLQUE', tipoRemolque: 'FURGON' },
    ] as unknown as Unidad[];
    expect(filtrar(u, 'furgon', textoUnidad).map((x) => x.placa)).toEqual(['R-77']);
    expect(filtrar(u, 'tracto', textoUnidad).map((x) => x.placa)).toEqual(['ABC-123']);
  });

  it('G2: cuenta los documentos vencidos o por vencer', () => {
    const docs = [{ venceEl: '2026-10-01' }, { venceEl: '2026-11-15' }, { venceEl: '2027-06-01' }];
    expect(documentosEnAviso(docs, '2026-10-31')).toBe(2);
    expect(documentosEnAviso([], '2026-10-31')).toBe(0);
  });
});

describe('JV-1 y NG-4: lo que no puede salir', () => {
  const hoy = '2026-11-01';
  const base = { placa: 'B', estado: 'DISPONIBLE', kmDesdeUltimoMantenimiento: 100, documentos: [{ tipo: 'SOAT', venceEl: '2027-06-01' }] };

  it('la lista abre con el mantenimiento pendiente o el documento vencido primero y las inactivas al final', () => {
    const unidades = [
      { ...base, placa: 'A1' },
      { ...base, placa: 'Z9', estado: 'MANTENIMIENTO_PENDIENTE' },
      { ...base, placa: 'C3', estado: 'INACTIVA' },
      { ...base, placa: 'D4', kmDesdeUltimoMantenimiento: 9500 },
      { ...base, placa: 'E5', documentos: [{ tipo: 'SOAT', venceEl: '2026-10-01' }] },
      { ...base, placa: 'F6', estado: 'EN_MANTENIMIENTO' },
    ] as never[];
    const orden = [...unidades].sort((a, b) => urgenciaUnidad(a, hoy).localeCompare(urgenciaUnidad(b, hoy)));
    expect(orden.map((u: { placa: string }) => u.placa)).toEqual(['E5', 'Z9', 'F6', 'D4', 'A1', 'C3']);
  });

  it('dice por qué está detenida y quién lo resuelve, solo con lo que trae Flota', () => {
    const pendiente = { ...base, estado: 'MANTENIMIENTO_PENDIENTE', kmDesdeUltimoMantenimiento: 10250 } as never;
    expect(motivoBloqueo(pendiente, false, hoy)).toBe(
      'No puede salir: lleva 10.250 km desde el último mantenimiento. Lo programa el jefe de flota.',
    );
    expect(motivoBloqueo(pendiente, true, hoy)).toContain('Prográmalo con «Programar mantenimiento».');
    const vencido = { ...base, estado: 'MANTENIMIENTO_PENDIENTE', documentos: [{ tipo: 'SOAT', venceEl: '2026-10-01' }] } as never;
    expect(motivoBloqueo(vencido, false, hoy)).toBe('No puede salir: el SOAT venció el 01/10/2026. Lo programa el jefe de flota.');
    // R1F-1: regla C (D07). 9.500 km no basta; el SOAT a 10 días sí, y es lo que se nombra.
    const soatCerca = {
      ...base,
      estado: 'MANTENIMIENTO_PENDIENTE',
      kmDesdeUltimoMantenimiento: 9500,
      documentos: [{ tipo: 'SOAT', venceEl: '2026-11-11' }],
    } as never;
    expect(motivoBloqueo(soatCerca, false, hoy)).toBe('No puede salir: el SOAT vence el 11/11/2026. Lo programa el jefe de flota.');
    // Todas las causas que se cumplen; un documento a 20 días no cuenta.
    const varias = {
      ...base,
      estado: 'MANTENIMIENTO_PENDIENTE',
      kmDesdeUltimoMantenimiento: 10000,
      documentos: [
        { tipo: 'SOAT', venceEl: '2026-11-21' },
        { tipo: 'INSPECCION_TECNICA', venceEl: '2026-10-20' },
      ],
    } as never;
    expect(motivoBloqueo(varias, false, hoy)).toBe(
      'No puede salir: lleva 10.000 km desde el último mantenimiento; la inspección técnica venció el 20/10/2026. Lo programa el jefe de flota.',
    );
    // Sin km ni documentos que lo expliquen, no se inventa el motivo.
    expect(motivoBloqueo({ ...base, estado: 'MANTENIMIENTO_PENDIENTE' } as never, false, hoy)).toBe(
      'No puede salir: tiene un mantenimiento pendiente. Lo programa el jefe de flota.',
    );
    expect(motivoBloqueo({ ...base, estado: 'EN_MANTENIMIENTO' } as never, false, hoy)).toContain('el jefe de flota cierre');
    expect(motivoBloqueo(base as never, false, hoy)).toBeNull();
  });
});

describe('alta y edición de unidades (D104)', () => {
  const campos = {
    capacidadToneladas: 28,
    soat: '2027-05-01',
    inspeccion: '2027-04-01',
    // Lo que quedó escrito de otra clase no viaja (D76: Flota lo rechaza).
    atributos: { volumenM3: 85, capacidadTanqueLitros: 600, potenciaHp: null },
  };
  const documentos = [
    { tipo: 'SOAT', venceEl: '2027-05-01' },
    { tipo: 'INSPECCION_TECNICA', venceEl: '2027-04-01' },
  ];

  it('el tracto lleva su odómetro y sus atributos; sin capacidad ni tipo de remolque; placa en mayúsculas', () => {
    const datos = {
      tipoUnidad: 'TRACTO' as const,
      tipoRemolque: 'FURGON',
      placa: ' 4521ktr ',
      kilometraje: 1200,
      kmDesdeUltimoMantenimiento: 0,
    };
    expect(nuevaUnidadDesde(datos, campos)).toEqual({
      tipoUnidad: 'TRACTO',
      placa: '4521KTR',
      kilometraje: 1200,
      kmDesdeUltimoMantenimiento: 0,
      documentos,
      atributos: { capacidadTanqueLitros: 600 },
    });
  });

  it('el remolque lleva su tipo y su capacidad, sin odómetro; la edición manda lo mismo sin placa', () => {
    const datos = {
      tipoUnidad: 'REMOLQUE' as const,
      tipoRemolque: 'FURGON',
      placa: '3001FUR',
      kilometraje: 5,
      kmDesdeUltimoMantenimiento: 10,
    };
    expect(nuevaUnidadDesde(datos, campos)).toEqual({
      tipoUnidad: 'REMOLQUE',
      placa: '3001FUR',
      tipoRemolque: 'FURGON',
      capacidadToneladas: 28,
      kmDesdeUltimoMantenimiento: 10,
      documentos,
      atributos: { volumenM3: 85 },
    });
    expect(edicionDesde('FURGON', campos)).toEqual({ capacidadToneladas: 28, documentos, atributos: { volumenM3: 85 } });
    expect(edicionDesde('TRACTO', campos)).toEqual({ documentos, atributos: { capacidadTanqueLitros: 600 } });
  });

  it('clase por tipo, placa del contrato y mensajes propios', () => {
    expect(claseUnidad('TRACTO', 'CISTERNA')).toBe('TRACTO');
    expect(claseUnidad('REMOLQUE', 'CISTERNA')).toBe('CISTERNA');
    expect(PLACA.test('4521KTR') && PLACA.test('452KTR') && !PLACA.test('45KTR') && !PLACA.test('4521kt')).toBe(true);
    expect(mensajeUnidad({ placa: true })).toContain('4521KTR');
    expect(mensajeUnidad({ entero: true })).toBe('Escribe un número entero.');
    expect(mensajeUnidad({ mayorQueCero: true })).toBe('Debe ser mayor que 0.');
    expect(mensajeUnidad({ required: true })).toBe('Este dato es obligatorio.');
  });
});
