import { filtrar } from 'ui-comun/dominio';
import { estadoChofer, puedeInhabilitar, textoChofer, vigenciaLicencia, type Chofer } from './chofer';

describe('choferes (dominio)', () => {
  const lista = [
    { choferId: 'c1', nombre: 'Juan Peña', licenciaCategoria: 'C', licenciaVenceEl: '2026-11-10', activo: true, disponible: true },
    { choferId: 'c2', nombre: 'Ana Rojas', licenciaCategoria: 'B', licenciaVenceEl: '2027-05-01', activo: false, disponible: true },
  ] as Chofer[];

  it('inhabilitado manda sobre la disponibilidad', () => {
    expect(estadoChofer({ activo: false, disponible: true })).toBe('INACTIVO');
    expect(estadoChofer({ activo: true, disponible: false })).toBe('OCUPADO');
    expect(estadoChofer({ activo: true, disponible: true })).toBe('DISPONIBLE');
  });

  it('busca por nombre sin tildes y por estado en pantalla', () => {
    expect(filtrar(lista, 'pena', textoChofer).map((c) => c.choferId)).toEqual(['c1']);
    expect(filtrar(lista, 'inhabilitado', textoChofer).map((c) => c.choferId)).toEqual(['c2']);
  });

  it('marca la licencia por vencer', () => {
    expect(vigenciaLicencia(lista[0], '2026-10-31')).toBe('POR_VENCER');
  });

  it('D104: no se inhabilita a un chofer con una reserva activa ni a uno ya inhabilitado', () => {
    expect(puedeInhabilitar({ activo: true, disponible: true })).toBe(true);
    expect(puedeInhabilitar({ activo: true, disponible: false })).toBe(false);
    expect(puedeInhabilitar({ activo: false, disponible: true })).toBe(false);
  });
});
