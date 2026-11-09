const PORTAL = 'Portal del cliente · Transporte de carga';

/** Nombre de cada página para la pestaña del navegador (V3-15): el mismo del menú o del encabezado. */
const PAGINAS: [RegExp, string][] = [
  [/^\/cotizar\/?$/, 'Cotizar'],
  [/^\/cotizaciones\/[^/]+\/?$/, 'Tu cotización'],
  [/^\/servicios\/?$/, 'Servicios'],
  [/^\/servicios\/[^/]+\/?$/, 'Servicio'],
  [/^\/facturas(\/[^/]+)?\/?$/, 'Facturas y crédito'],
  [/^\/empresa\/?$/, 'Mi empresa'],
  [/^\/clientes\/?$/, 'Clientes'],
];

export function tituloDe(ruta: string): string {
  const pagina = PAGINAS.find(([patron]) => patron.test(ruta))?.[1];
  return pagina ? `${pagina} · ${PORTAL}` : PORTAL;
}
