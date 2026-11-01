import { filtrar } from 'ui-comun/dominio';
import { buscarRuta, textoRuta, type Ruta } from './ruta';

describe('rutas (dominio)', () => {
  const rutas = [
    { rutaId: 'r1', nombre: 'Santa Cruz - La Paz', origen: 'Santa Cruz', destino: 'La Paz', distanciaKm: 850 },
    { rutaId: 'r2', nombre: 'Santa Cruz - Potosí', origen: 'Santa Cruz', destino: 'Potosí', distanciaKm: 900 },
  ] as Ruta[];

  it('busca por destino sin tildes', () => {
    expect(filtrar(rutas, 'potosi', textoRuta).map((r) => r.rutaId)).toEqual(['r2']);
  });

  it('la ficha sale de la lista', () => {
    expect(buscarRuta(rutas, 'r1')?.destino).toBe('La Paz');
    expect(buscarRuta(rutas, 'x')).toBeUndefined();
  });
});
