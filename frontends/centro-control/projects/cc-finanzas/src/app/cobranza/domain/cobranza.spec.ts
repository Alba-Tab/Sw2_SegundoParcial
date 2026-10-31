import { paramsCobranza } from './cobranza';

const MAXIMO_DIAS_ANALITICA = 92; // servicios/analitica/app/dominio/reportes.py, CUENTAS_POR_COBRAR

describe('cuentas por cobrar', () => {
  it('pide un rango que Analítica acepta: 92 días o menos contando los dos extremos, en la fecha de La Paz', () => {
    // 30/10/2026 02:00 UTC todavía es 29/10 en La Paz (UTC−4).
    const p = paramsCobranza(new Date('2026-10-30T02:00:00Z'));
    expect(p).toEqual({ desde: '2026-08-29', hasta: '2026-11-28', incluirVencidas: true });
    const dias = (Date.parse(p.hasta as string) - Date.parse(p.desde as string)) / 86_400_000 + 1;
    expect(dias).toBeLessThanOrEqual(MAXIMO_DIAS_ANALITICA);
  });
});
