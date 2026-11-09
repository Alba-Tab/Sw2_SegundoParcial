import { bloquesVisibles, pendientes, puedeAbrir, type EstadoTarjeta } from './tablero';

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

describe('lo que pide acción (U7)', () => {
  const todo = bloquesVisibles(['gerente']);
  const bien = (): EstadoTarjeta => null;
  const t = {
    viajesEnCurso: [
      {
        viajeId: 'v1',
        placa: 'AAA-1',
        riesgo: { enRiesgo: true, probabilidad: 0.6 },
        cliente: { razonSocial: 'Soya SA' },
        ruta: { nombre: 'SCZ-LPZ' },
      },
      { viajeId: 'v2', placa: 'BBB-2', riesgo: { enRiesgo: false, probabilidad: 0.1 } },
      { viajeId: 'v3', placa: 'CCC-3', riesgo: { enRiesgo: true, probabilidad: 0.9 } },
    ],
    unidadesPorEstado: [
      { estado: 'DISPONIBLE', cantidad: 4 },
      { estado: 'MANTENIMIENTO_PENDIENTE', cantidad: 1 },
    ],
    cuentasPorCobrar: { facturasVencidas: 3, facturasPorVencer: 2 },
    alertasAbiertas: 2,
  };

  it('primero los viajes en riesgo (el más probable arriba), luego mora, mantenimiento y alertas', () => {
    const p = pendientes(t, todo, bien);
    expect(p.map((x) => x.clave)).toEqual(['riesgo-v3', 'riesgo-v1', 'mora', 'mantenimiento', 'alertas']);
    expect(p[1]).toMatchObject({
      texto: 'Viaje AAA-1 en riesgo de retraso (60 %)',
      tono: 'aviso',
      detalle: 'Soya SA · SCZ-LPZ',
      app: 'cc-operaciones',
      ruta: '/viajes/v1',
    });
    expect(p[2].texto).toBe('3 facturas vencidas por cobrar');
    expect(p[3]).toMatchObject({
      texto: '1 unidad con mantenimiento pendiente',
      app: 'cc-flota',
      ruta: '/unidades?estado=MANTENIMIENTO_PENDIENTE',
    });
    expect(p[4].app).toBeUndefined();
  });

  it('NG-3: al gerente no le promete marcar alertas atendidas; al que las atiende, sí', () => {
    const alertas = (puede: boolean) => pendientes(t, todo, bien, puede).find((x) => x.clave === 'alertas')?.detalle;
    expect(alertas(true)).toBe('Se revisan y se marcan atendidas desde la campana de la barra.');
    expect(alertas(false)).toContain('las marca atendidas quien las resuelve');
  });

  it('cada rol ve solo lo suyo: el jefe de flota no ve riesgo ni mora', () => {
    expect(pendientes(t, bloquesVisibles(['jefe_flota']), bien).map((x) => x.clave)).toEqual(['mantenimiento', 'alertas']);
  });

  it('nada que hacer: lista vacía; un servicio caído se dice en vez de callarlo (FR1, FR2)', () => {
    expect(pendientes({ alertasAbiertas: 0 }, bloquesVisibles(['administracion']), bien)).toEqual([]);
    const caida = pendientes(t, todo, (c) => (c === 'cuentasPorCobrar' ? 'no-disponible' : null));
    expect(caida.find((x) => x.clave === 'sin-cuentasPorCobrar')).toMatchObject({
      texto: 'Finanzas no disponible',
      detalle: 'No se puede saber si hay facturas en mora.',
    });
    expect(caida.some((x) => x.clave === 'mora')).toBe(false);
  });
});
