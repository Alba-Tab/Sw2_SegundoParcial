import { nombreCliente, nombreRuta } from './cotizacion';

describe('cotizaciones: nombres sin ids crudos', () => {
  it('el nombre si está en la lista; si no, una frase; sin lista, "Sin dato"', () => {
    const clientes = [{ clienteId: 'c1', razonSocial: 'Agroexport' }] as Parameters<typeof nombreCliente>[0];
    expect(nombreCliente(clientes, 'c1')).toBe('Agroexport');
    expect(nombreCliente(clientes, 'c9')).toBe('Cliente fuera de la lista cargada');
    expect(nombreCliente(null, 'c1')).toBe('Sin dato');
    const rutas = [{ rutaId: 'r1', nombre: 'SCZ → LPZ' }] as Parameters<typeof nombreRuta>[0];
    expect(nombreRuta(rutas, 'r9')).toBe('Ruta fuera de la lista cargada');
    expect(nombreRuta(undefined, 'r1')).toBe('Sin dato');
  });
});
