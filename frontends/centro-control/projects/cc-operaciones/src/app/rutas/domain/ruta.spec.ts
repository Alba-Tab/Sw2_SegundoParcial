import { filtrar } from 'ui-comun/dominio';
import { aInputRuta, textoActiva, textoRuta, valoresIniciales, type FichaRuta, type Ruta } from './ruta';

describe('rutas (dominio)', () => {
  const rutas = [
    { rutaId: 'r1', nombre: 'Santa Cruz - La Paz', origen: 'Santa Cruz', destino: 'La Paz', distanciaKm: 850, activa: true },
    { rutaId: 'r2', nombre: 'Santa Cruz - Potosí', origen: 'Santa Cruz', destino: 'Potosí', distanciaKm: 900, activa: false },
  ] as Ruta[];

  it('busca por destino sin tildes y dice si está activa', () => {
    expect(filtrar(rutas, 'potosi', textoRuta).map((r) => r.rutaId)).toEqual(['r2']);
    expect(rutas.map(textoActiva)).toEqual(['Activa', 'Inactiva']);
    expect(textoActiva({ activa: null })).toBe('Activa');
  });

  it('un alta empieza activa con 300 m de geocerca; una edición trae los datos de la ruta', () => {
    expect(valoresIniciales()).toMatchObject({ nombre: '', radioMetros: 300, activa: true, distanciaKm: null });
    const ficha = {
      rutaId: 'r2',
      nombre: 'SCZ - PTS',
      origen: 'Santa Cruz',
      destino: 'Potosí',
      distanciaKm: 900,
      activa: false,
      radioMetros: 500,
      origenCoordenadas: { lat: -17.78, lng: -63.18 },
      destinoCoordenadas: { lat: -19.58, lng: -65.75 },
    } as FichaRuta;
    expect(valoresIniciales(ficha)).toEqual({
      nombre: 'SCZ - PTS',
      origen: 'Santa Cruz',
      origenLat: -17.78,
      origenLng: -63.18,
      destino: 'Potosí',
      destinoLat: -19.58,
      destinoLng: -65.75,
      radioMetros: 500,
      distanciaKm: 900,
      activa: false,
    });
  });

  it('el input recorta los nombres y lleva el radio dentro del destino (RutaInput)', () => {
    const input = aInputRuta({
      ...valoresIniciales(),
      nombre: ' SCZ - LPZ ',
      origen: 'Santa Cruz ',
      origenLat: -17.78,
      origenLng: -63.18,
      destino: ' La Paz',
      destinoLat: -16.5,
      destinoLng: -68.15,
      distanciaKm: 850.5,
    });
    expect(input).toEqual({
      nombre: 'SCZ - LPZ',
      origen: { nombre: 'Santa Cruz', coordenadas: { lat: -17.78, lng: -63.18 } },
      destino: { nombre: 'La Paz', coordenadas: { lat: -16.5, lng: -68.15 }, radioMetros: 300 },
      distanciaKm: 850.5,
      activa: true,
    });
  });
});
