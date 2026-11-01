import { estadoLineaCredito, puedeVer, vigencia } from 'ui-comun/dominio';

describe('vigencia y línea de crédito (dominio)', () => {
  it('un documento vencido, por vencer dentro de 30 días o vigente', () => {
    expect(vigencia('2026-10-30', '2026-10-31')).toBe('VENCIDO');
    expect(vigencia('2026-10-31', '2026-10-31')).toBe('POR_VENCER');
    expect(vigencia('2026-11-30', '2026-10-31')).toBe('POR_VENCER');
    expect(vigencia('2026-12-01', '2026-10-31')).toBe('VIGENTE');
  });

  it('la mora manda; sin disponible es aviso; si no, al día (en centavos, sin float)', () => {
    expect(estadoLineaCredito({ enMora: true, disponible: '500.00' })).toBe('EN_MORA');
    expect(estadoLineaCredito({ enMora: false, disponible: '0.00' })).toBe('SIN_DISPONIBLE');
    expect(estadoLineaCredito({ enMora: false, disponible: '0.01' })).toBe('AL_DIA');
  });

  it('el despachador no ve la línea de crédito', () => {
    expect(puedeVer(['despachador'], 'lineaCredito')).toBe(false);
    expect(puedeVer(['comercial'], 'lineaCredito')).toBe(true);
  });
});
