import { filtrar } from 'ui-comun/dominio';
import { CORREO, mensajeCampoCliente, NIT, nombreRuta, textoCliente, type FilaCliente } from './cliente';

describe('clientes (dominio)', () => {
  const lista = [
    { clienteId: 'c1', razonSocial: 'Soya Oriente SRL', nit: '1020304', correo: 'compras@soya.bo' },
    { clienteId: 'c2', razonSocial: 'Logística Andina', nit: null, correo: null },
  ] as FilaCliente[];

  it('busca por razón social sin tildes, por NIT y por correo', () => {
    expect(filtrar(lista, 'logistica', textoCliente).map((c) => c.clienteId)).toEqual(['c2']);
    expect(filtrar(lista, '1020304', textoCliente).map((c) => c.clienteId)).toEqual(['c1']);
    expect(filtrar(lista, 'compras@', textoCliente).map((c) => c.clienteId)).toEqual(['c1']);
  });

  it('la ruta se nombra con la copia de rutas', () => {
    expect(nombreRuta([{ rutaId: 'r1', nombre: 'SCZ - LPZ' }], 'r1')).toBe('SCZ - LPZ');
    expect(nombreRuta([], null)).toBe('');
  });

  it('NIT y correo con las reglas del alta (spec 001), y su frase bajo el campo', () => {
    expect(['12345', '12345678901234567890'].every((n) => NIT.test(n))).toBe(true);
    expect(['1234', '123456789012345678901', '1023-456', '12a45'].some((n) => NIT.test(n))).toBe(false);
    expect(CORREO.test('cobranzas@agro.bo')).toBe(true);
    expect(CORREO.test('cobranzas@agro')).toBe(false);
    expect(mensajeCampoCliente('nit', { pattern: true })).toContain('5 a 20 dígitos');
    expect(mensajeCampoCliente('correo', { pattern: true })).toContain('correo válido');
    expect(mensajeCampoCliente('nit', { nitRepetido: true })).toBe('Ya hay otro cliente activo con ese NIT.');
    expect(mensajeCampoCliente('razonSocial', { required: true })).toBe('Este dato es obligatorio.');
  });
});
