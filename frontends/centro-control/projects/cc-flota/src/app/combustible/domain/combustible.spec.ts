import { destinosPorPlaca } from './combustible';

describe('combustible (dominio)', () => {
  it('5b: la placa lleva a la ficha de su unidad por id; si Flota no la trae, a la lista filtrada', () => {
    const destino = destinosPorPlaca([{ unidadId: 'u-1', placa: '7341CST' }]);
    expect(destino('7341CST')).toEqual({ ruta: '/unidades/u-1' });
    expect(destino('9999XYZ')).toEqual({ ruta: '/unidades', q: '9999XYZ' });
  });
});
