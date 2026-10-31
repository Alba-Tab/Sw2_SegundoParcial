import { popupViaje } from './mapa';

describe('mapa en vivo', () => {
  it('arma el popup como texto: la razón social con HTML no se interpreta (XSS almacenado)', () => {
    const malicioso = '<img src=x onerror="alert(1)">Transportes <b>SA</b>';
    const popup = popupViaje(
      {
        viajeId: 'v1',
        placa: '4521KTR',
        ultimaPosicion: { lat: -17.78, lng: -63.18 },
        cliente: { razonSocial: malicioso },
        ruta: { nombre: 'Santa Cruz → Cochabamba' },
        riesgo: { probabilidad: 0.8, enRiesgo: true },
      },
      'http://localhost:4202/viajes/v1',
    );
    expect(popup.querySelector('img')).toBeNull();
    expect(popup.querySelectorAll('b')).toHaveLength(1);
    expect(popup.textContent).toContain(malicioso);
    expect(popup.querySelector('a')?.getAttribute('href')).toBe('http://localhost:4202/viajes/v1');
    expect(popup.textContent).toContain('Riesgo 80 %');
  });
});
