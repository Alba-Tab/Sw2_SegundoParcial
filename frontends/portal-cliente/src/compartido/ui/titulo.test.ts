import { describe, expect, it } from 'vitest';
import { tituloDe } from './titulo';

describe('título de la pestaña (V3-15)', () => {
  it('nombra la página, también en los detalles', () => {
    expect(tituloDe('/servicios')).toBe('Servicios · Portal del cliente · Transporte de carga');
    expect(tituloDe('/servicios/0193c000')).toBe('Servicio · Portal del cliente · Transporte de carga');
    expect(tituloDe('/facturas/abc')).toBe('Facturas y crédito · Portal del cliente · Transporte de carga');
  });

  it('una ruta desconocida deja el nombre del portal', () => {
    expect(tituloDe('/no/existe')).toBe('Portal del cliente · Transporte de carga');
  });
});
