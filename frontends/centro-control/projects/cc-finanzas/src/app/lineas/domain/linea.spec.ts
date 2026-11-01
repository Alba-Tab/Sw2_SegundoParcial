import { filtrar } from 'ui-comun/dominio';
import { conLinea, disponibleCon, estadoLinea, textoLinea, usadoDe, type ClienteConLinea } from './linea';

describe('líneas de crédito (dominio)', () => {
  const linea = { limite: '10000.00', reservado: '0.00', utilizado: '10000.00', disponible: '0.00', enMora: false, suspendida: false };

  it('lo usado es reservado + utilizado y el disponible con un límite nuevo se calcula sin float (spec 012)', () => {
    const usado = usadoDe({ reservado: '7600.10', utilizado: '2800.20' });
    expect(usado).toBe('10400.30');
    expect(disponibleCon('10400.30', usado)).toBe('0.00');
    expect(disponibleCon('50000.00', usado)).toBe('39599.70');
  });

  it('una línea suspendida sale como SUSPENDIDA aunque tenga disponible', () => {
    expect(estadoLinea({ lineaCredito: { ...linea, disponible: '5000.00', suspendida: true } })).toBe('SUSPENDIDA');
  });
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
