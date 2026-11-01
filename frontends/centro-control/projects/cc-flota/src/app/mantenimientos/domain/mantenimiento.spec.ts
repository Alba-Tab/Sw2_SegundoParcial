import { filtrar } from 'ui-comun/dominio';
import { puedeCerrar, textoMantenimiento, type FilaMantenimiento } from './mantenimiento';

describe('mantenimientos (dominio)', () => {
  const filas = [
    { placa: 'ABC-123', tipo: 'PREVENTIVO', taller: 'Taller Norte', descripcion: 'Cambio de aceite', estado: 'EN_CURSO' },
    { placa: 'R-77', tipo: 'DOCUMENTOS', taller: 'Tránsito', descripcion: 'SOAT', estado: 'CERRADO' },
  ] as unknown as FilaMantenimiento[];

  it('busca por placa, tipo en pantalla y taller, sin tildes', () => {
    expect(filtrar(filas, 'preventivo', textoMantenimiento).map((m) => m.placa)).toEqual(['ABC-123']);
    expect(filtrar(filas, 'transito', textoMantenimiento).map((m) => m.placa)).toEqual(['R-77']);
  });

  it('solo se cierra uno en curso', () => {
    expect(puedeCerrar(filas[0])).toBe(true);
    expect(puedeCerrar(filas[1])).toBe(false);
  });
});
