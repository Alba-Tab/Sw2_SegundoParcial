import { cierreInicial, lineasChecklist, puedeProgramar, type Mantenimiento } from './unidad';

describe('unidades (dominio)', () => {
  it('el checklist es una línea por ítem, sin líneas vacías', () => {
    expect(lineasChecklist('Aceite y filtros\n  Frenos \n\nLuces\n')).toEqual(['Aceite y filtros', 'Frenos', 'Luces']);
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
});
