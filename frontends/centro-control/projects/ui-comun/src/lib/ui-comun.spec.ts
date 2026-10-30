import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { esperaReconexion } from './conexion';
import { APPS_POR_ROL, DESTINO_POR_ROL } from './configuracion';
import { codigoDe, mensajeDe, servicioCaido } from './errores';
import { BobPipe, fechaLaPaz, FechaPipe, pct } from './formato';
import { reclamos } from './sesion';

const jwt = (datos: object) => `x.${btoa(JSON.stringify(datos)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.y`;

describe('ui-comun', () => {
  it('D99: reconexión 1, 2, 4… s hasta 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(esperaReconexion)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  it('lee roles y nombre del token sin romperse con uno ilegible', () => {
    expect(reclamos(jwt({ sub: 's', name: 'Gerente', realm_access: { roles: ['gerente'] } })).realm_access?.roles).toEqual(['gerente']);
    expect(reclamos('basura')).toEqual({});
    expect(reclamos(undefined)).toEqual({});
  });

  it('cada rol entra a su app y ve solo los enlaces que le tocan (propuesta 6.1)', () => {
    expect(Object.fromEntries(DESTINO_POR_ROL)).toEqual({
      gerente: 'cc-tablero',
      despachador: 'cc-operaciones',
      jefe_flota: 'cc-flota',
      administracion: 'cc-finanzas',
      comercial: 'cc-operaciones',
    });
    expect(APPS_POR_ROL['despachador']).not.toContain('cc-finanzas');
    expect(APPS_POR_ROL['cliente']).toBeUndefined();
  });

  it('respuesta parcial: detecta el campo del servicio caído y el código de un error', () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        { message: 'Finanzas no disponible', path: ['tablero', 'cuentasPorCobrar'], extensions: { codigo: 'DEPENDENCIA_NO_DISPONIBLE' } },
      ],
    });
    expect(servicioCaido(error, 'cuentasPorCobrar')).toBe(true);
    expect(servicioCaido(error, 'unidadesPorEstado')).toBe(false);
    expect(codigoDe(error)).toBe('DEPENDENCIA_NO_DISPONIBLE');
    expect(mensajeDe(error)).toBe('Finanzas no disponible');
  });

  it('formatea dinero como texto (nunca float en cálculos), fechas y porcentajes', () => {
    expect(new BobPipe().transform('2800.00')).toBe('2.800,00 BOB');
    expect(new BobPipe().transform(null)).toBe('—');
    expect(new FechaPipe().transform('2026-11-03')).toBe('03/11/2026');
    expect(pct(0.857)).toBe('86 %');
  });

  it('las fechas por defecto salen de La Paz (UTC−4), no de UTC', () => {
    const noche = new Date('2026-10-31T02:30:00Z'); // 30/10 22:30 en La Paz
    expect(fechaLaPaz(0, noche)).toBe('2026-10-30');
    expect(fechaLaPaz(-61, noche)).toBe('2026-08-30');
    expect(fechaLaPaz(2, noche)).toBe('2026-11-01');
    expect(fechaLaPaz(1, new Date('2026-12-31T12:00:00Z'))).toBe('2027-01-01');
  });
});
