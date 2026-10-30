import { interpretar, rutasTesseract } from './ocr';

describe('OCR del recibo', () => {
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

  it('propone monto, fecha y referencia del texto leído', () => {
    expect(interpretar('BANCO UNION\nFecha: 28/10/2026\nRef: TRX-99812\nComisión 5,00\nTotal Bs 2.800,00')).toEqual({
      monto: '2800.00',
      fecha: '2026-10-28',
      referencia: 'TRX-99812',
    });
  });
});
