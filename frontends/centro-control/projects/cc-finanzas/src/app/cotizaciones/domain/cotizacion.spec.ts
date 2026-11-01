import { nombreCliente, nombreRuta } from './cotizacion';

describe('cotizaciones: nombres sin ids crudos', () => {
  it('el nombre si está en la lista; si no, una frase; sin lista, "Sin dato"', () => {
    expect(nombreCliente({ razonSocial: 'Agroexport' })).toBe('Agroexport');
    expect(nombreCliente({ razonSocial: null })).toBe('Sin dato');
    const rutas = [{ rutaId: 'r1', nombre: 'SCZ → LPZ' }] as Parameters<typeof nombreRuta>[0];
    expect(nombreRuta(rutas, 'r9')).toBe('Ruta fuera de la lista cargada');
    expect(nombreRuta(undefined, 'r1')).toBe('Sin dato');
  });
});
