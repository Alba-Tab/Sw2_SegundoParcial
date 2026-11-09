import { rutasTesseract } from './lector-recibos';

describe('lector de recibos', () => {
  it('D38: worker, core e idioma salen del hosting propio, nunca de un CDN', () => {
    const rutas = rutasTesseract('https://finanzas.transporte.bo');
    expect(rutas).toEqual({
      workerPath: 'https://finanzas.transporte.bo/tesseract/worker.min.js',
      corePath: 'https://finanzas.transporte.bo/tesseract/',
      langPath: 'https://finanzas.transporte.bo/tesseract',
      workerBlobURL: false,
    });
    expect(JSON.stringify(rutas)).not.toMatch(/jsdelivr|unpkg|cdn/);
  });
});
