import { colaDeOrigen, mapaSinPosiciones } from './viaje';

describe('colaDeOrigen (V1-5)', () => {
  it('vuelve a la cola de la que vino el despachador', () => {
    expect(colaDeOrigen('entregas-observadas')).toEqual({ texto: 'Entregas observadas', ruta: '/decisiones/entregas-observadas' });
    expect(colaDeOrigen('intervenciones')).toEqual({ texto: 'Intervenciones', ruta: '/decisiones/intervenciones' });
    expect(colaDeOrigen('acciones')).toEqual({ texto: 'Acciones del agente', ruta: '/acciones' });
  });

  it('cualquier otro valor lleva a la lista de viajes', () => {
    for (const de of [undefined, null, '', 'mapa', '//evil.com', 'toString', '__proto__']) {
      expect(colaDeOrigen(de)).toEqual({ texto: 'Viajes', ruta: '/viajes' });
    }
  });
});

describe('mapaSinPosiciones (FB-5)', () => {
  const con = { ultimaPosicion: { lat: -17.78, lng: -63.18 } };
  const sin = { ultimaPosicion: null };
  it('solo con la respuesta, sin error y sin ninguna posición', () => {
    expect(mapaSinPosiciones([], false, undefined)).toBe(true);
    expect(mapaSinPosiciones([sin], false, undefined)).toBe(true);
    expect(mapaSinPosiciones([sin, con], false, undefined)).toBe(false);
    expect(mapaSinPosiciones([], true, undefined)).toBe(false);
    expect(mapaSinPosiciones([], false, new Error('Viajes no responde'))).toBe(false);
  });
});
