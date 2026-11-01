import { filtrar } from 'ui-comun/dominio';
import { buscarCliente, nombreRuta, textoCliente, type FilaCliente } from './cliente';

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

  it('la ficha sale de la lista; la ruta se nombra con la copia de rutas', () => {
    expect(buscarCliente(lista, 'c2')?.razonSocial).toBe('Logística Andina');
    expect(buscarCliente(lista, 'x')).toBeUndefined();
    expect(nombreRuta([{ rutaId: 'r1', nombre: 'SCZ - LPZ' }], 'r1')).toBe('SCZ - LPZ');
    expect(nombreRuta([], null)).toBe('');
  });
});
