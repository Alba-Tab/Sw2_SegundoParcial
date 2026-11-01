import { filtrar } from 'ui-comun/dominio';
import { cierreInicial, lineasChecklist, puedeProgramar, textoUnidad, type Mantenimiento, type Unidad } from './unidad';

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

  it('la búsqueda encuentra por placa y por el tipo como se lee en pantalla, sin tildes', () => {
    const u = [
      { placa: 'ABC-123', tipoUnidad: 'TRACTO', tipoRemolque: null },
      { placa: 'R-77', tipoUnidad: 'REMOLQUE', tipoRemolque: 'FURGON' },
    ] as unknown as Unidad[];
    expect(filtrar(u, 'furgon', textoUnidad).map((x) => x.placa)).toEqual(['R-77']);
    expect(filtrar(u, 'tracto', textoUnidad).map((x) => x.placa)).toEqual(['ABC-123']);
  });
});
