import { bloquesVisibles, puedeAbrir } from './tablero';

describe('tablero por rol', () => {
  it('el gerente ve y pide los 4 bloques, con el riesgo de cada viaje', () => {
    expect(bloquesVisibles(['gerente'])).toEqual({
      verViajes: true,
      verRiesgo: true,
      verUnidades: true,
      verCobranza: true,
      verAlertas: true,
    });
  });

  it('despachador y jefe de flota no ven cuentas por cobrar; el jefe de flota tampoco el riesgo (propuesta 7.2)', () => {
    expect(bloquesVisibles(['despachador'])).toEqual({
      verViajes: true,
      verRiesgo: true,
      verUnidades: true,
      verCobranza: false,
      verAlertas: true,
    });
    expect(bloquesVisibles(['jefe_flota'])).toEqual({
      verViajes: true,
      verRiesgo: false,
      verUnidades: true,
      verCobranza: false,
      verAlertas: true,
    });
  });

  it('administracion no ve viajes ni unidades (Viajes y Flota le responden 403)', () => {
    expect(bloquesVisibles(['administracion'])).toEqual({
      verViajes: false,
      verRiesgo: false,
      verUnidades: false,
      verCobranza: true,
      verAlertas: true,
    });
  });

  it('comercial ve solo viajes (sin riesgo): ni unidades, ni cobranza, ni alertas', () => {
    expect(bloquesVisibles(['comercial'])).toEqual({
      verViajes: true,
      verRiesgo: false,
      verUnidades: false,
      verCobranza: false,
      verAlertas: false,
    });
  });

  it('reportes y voz para los 4 roles de la spec 015; el agente, solo gerente y despachador (spec 014)', () => {
    for (const rol of ['gerente', 'administracion', 'despachador', 'jefe_flota']) {
      expect(puedeAbrir([rol], 'reportes')).toBe(true);
      expect(puedeAbrir([rol], 'voz')).toBe(true);
    }
    expect(puedeAbrir(['comercial'], 'reportes')).toBe(false);
    expect(puedeAbrir(['comercial'], 'voz')).toBe(false);
    expect(['gerente', 'despachador', 'jefe_flota', 'administracion', 'comercial'].filter((r) => puedeAbrir([r], 'agente'))).toEqual([
      'gerente',
      'despachador',
    ]);
  });
});
