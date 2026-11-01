import { colaDeOrigen } from './viaje';

describe('colaDeOrigen (V1-5)', () => {
  it('vuelve a la cola de la que vino el despachador', () => {
    expect(colaDeOrigen('entregas-observadas')).toEqual({ texto: 'Entregas observadas', ruta: '/entregas-observadas' });
    expect(colaDeOrigen('intervenciones')).toEqual({ texto: 'Intervenciones', ruta: '/intervenciones' });
    expect(colaDeOrigen('acciones')).toEqual({ texto: 'Acciones del agente', ruta: '/acciones' });
  });

  it('cualquier otro valor lleva a la lista de viajes', () => {
    for (const de of [undefined, null, '', 'mapa', '//evil.com', 'toString', '__proto__']) {
      expect(colaDeOrigen(de)).toEqual({ texto: 'Viajes', ruta: '/viajes' });
    }
  });
});
