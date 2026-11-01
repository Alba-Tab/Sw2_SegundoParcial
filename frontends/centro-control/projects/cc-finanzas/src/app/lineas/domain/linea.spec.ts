import { filtrar } from 'ui-comun/dominio';
import { conLinea, estadoLinea, textoLinea, type ClienteConLinea } from './linea';

describe('líneas de crédito (dominio)', () => {
  const linea = { limite: '10000.00', reservado: '0.00', utilizado: '10000.00', disponible: '0.00', enMora: false };
  const clientes = [
    { clienteId: 'c1', razonSocial: 'Soya Oriente', nit: '123', lineaCredito: linea },
    { clienteId: 'c2', razonSocial: 'Sin Crédito SA', nit: null, lineaCredito: null },
  ] as ClienteConLinea[];

  it('lista solo los clientes con línea', () => {
    expect(conLinea(clientes).map((c) => c.clienteId)).toEqual(['c1']);
  });

  it('busca por razón social o NIT y calcula el estado', () => {
    expect(filtrar(clientes, '123', textoLinea).map((c) => c.clienteId)).toEqual(['c1']);
    expect(estadoLinea(conLinea(clientes)[0])).toBe('SIN_DISPONIBLE');
  });
});
