import { popupViaje } from './mapa';

describe('mapa en vivo', () => {
  it('arma el popup como texto: la razón social con HTML no se interpreta (XSS almacenado)', () => {
    const malicioso = '<img src=x onerror="alert(1)">Transportes <b>SA</b>';
    const popup = popupViaje(
      {
        viajeId: 'v1',
        placa: '4521KTR',
        cliente: { clienteId: 'c1', razonSocial: malicioso },
        ruta: { rutaId: 'r1', nombre: 'Santa Cruz → Cochabamba', destino: 'Cochabamba', distanciaKm: 470 },
        riesgo: { probabilidad: 0.8, enRiesgo: true },
      } as Parameters<typeof popupViaje>[0],
      'http://localhost:4202/viajes/v1',
    );
    expect(popup.querySelector('img')).toBeNull();
    expect(popup.querySelectorAll('b')).toHaveLength(1);
    expect(popup.textContent).toContain(malicioso);
    expect(popup.querySelector('a')?.getAttribute('href')).toBe('http://localhost:4202/viajes/v1');
    expect(popup.textContent).toContain('Riesgo 80 %');
  });
});
