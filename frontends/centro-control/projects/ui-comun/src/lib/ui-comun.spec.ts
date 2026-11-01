import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { avisosServicio } from './aviso-servicios';
import { esperaReconexion } from './conexion';
import { APPS_POR_ROL, DESTINO_POR_ROL, urlEnApp } from './configuracion';
import { codigoDe, mensajeDe, servicioCaido, sinPermiso } from './errores';
import { aCentavos, fechaLaPaz, pct, puedeVer, sumarMontos } from 'ui-comun/dominio';
import { BobPipe, FechaPipe, NumeroPipe } from './formato';
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

  it('FL-1: enlaza la ficha de otra app con ?desde= solo si el rol abre esa app', () => {
    const config = { app: 'cc-operaciones', urls: { 'cc-flota': 'http://f' } } as never;
    expect(urlEnApp(config, ['gerente'], 'cc-flota', '/unidades/u1')).toBe('http://f/unidades/u1?desde=cc-operaciones');
    expect(urlEnApp(config, ['despachador'], 'cc-flota', '/unidades/u1')).toBeNull();
  });

  it('respuesta parcial: detecta el campo del servicio caído y el código de un error', () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        { message: 'Finanzas no disponible', path: ['tablero', 'cuentasPorCobrar'], extensions: { codigo: 'DEPENDENCIA_NO_DISPONIBLE' } },
      ],
    });
    expect(servicioCaido(error, 'cuentasPorCobrar')).toBe(true);
    expect(servicioCaido(error, 'unidadesPorEstado')).toBe(false);
    expect(sinPermiso(error, 'cuentasPorCobrar')).toBe(false);
    expect(codigoDe(error)).toBe('DEPENDENCIA_NO_DISPONIBLE');
    expect(mensajeDe(error)).toBe('Un servicio no responde. Intenta de nuevo en unos segundos.');
  });

  it('un SIN_PERMISO del campo (rol sin acceso) no se confunde con un servicio caído', () => {
    const error = new CombinedGraphQLErrors({
      errors: [{ message: 'Sin permiso', path: ['tablero', 'unidadesPorEstado'], extensions: { codigo: 'SIN_PERMISO' } }],
    });
    expect(sinPermiso(error, 'unidadesPorEstado')).toBe(true);
    expect(servicioCaido(error, 'unidadesPorEstado')).toBe(false);
    expect(sinPermiso(error, 'viajesEnCurso')).toBe(false);
    expect(sinPermiso(undefined, 'viajesEnCurso')).toBe(false);
  });

  it('roles por campo: copia de los @roles del esquema (propuesta 7.2)', () => {
    expect(puedeVer(['despachador'], 'monto')).toBe(false);
    expect(puedeVer(['comercial'], 'monto')).toBe(true);
    expect(puedeVer(['comercial'], 'riesgo')).toBe(false);
    expect(puedeVer(['jefe_flota'], 'riesgo')).toBe(false);
    expect(puedeVer(['despachador'], 'riesgo')).toBe(true);
    expect(puedeVer(['comercial'], 'unidad')).toBe(false);
    expect(puedeVer(['jefe_flota', 'gerente'], 'cuentasPorCobrar')).toBe(true);
    expect(puedeVer([], 'monto')).toBe(false);
  });

  it('formatea dinero como texto (nunca float en cálculos), fechas y porcentajes', () => {
    expect(new BobPipe().transform('2800.00')).toBe('2.800,00\u00a0BOB');
    expect(new BobPipe().transform(null)).toBe('Sin dato');
    expect(new FechaPipe().transform('2026-11-03')).toBe('03/11/2026');
    // Un instante sale en La Paz (UTC−4), en 24 h y sin "a. m.".
    expect(new FechaPipe().transform('2026-11-01T14:20:00Z', true)).toBe('01/11 10:20');
    expect(new FechaPipe().transform('2026-11-01T02:05:00Z', true)).toBe('31/10 22:05');
    expect(new FechaPipe().transform('2026-11-01T02:05:00Z')).toBe('31/10/2026');
    expect(pct(0.857)).toBe('86 %');
  });

  it('las fechas por defecto salen de La Paz (UTC−4), no de UTC', () => {
    const noche = new Date('2026-10-31T02:30:00Z'); // 30/10 22:30 en La Paz
    expect(fechaLaPaz(0, noche)).toBe('2026-10-30');
    expect(fechaLaPaz(-61, noche)).toBe('2026-08-30');
    expect(fechaLaPaz(2, noche)).toBe('2026-11-01');
    expect(fechaLaPaz(1, new Date('2026-12-31T12:00:00Z'))).toBe('2027-01-01');
  });

  it('FR1: avisa "<Servicio> no disponible" por cada campo caído y, sin datos, el mensaje del error', () => {
    const parcial = new CombinedGraphQLErrors({
      errors: [
        { message: 'Flota no disponible (no responde)', path: ['viaje', 'unidad'], extensions: { codigo: 'DEPENDENCIA_NO_DISPONIBLE' } },
        { message: 'Tu rol no tiene acceso a este dato', path: ['viaje', 'monto'], extensions: { codigo: 'SIN_PERMISO' } },
      ],
    });
    const campos = { viaje: 'Viajes', unidad: 'Flota', riesgo: 'Analítica' };
    expect(avisosServicio(parcial, campos)).toEqual(['Flota no disponible']);
    // Un SIN_PERMISO de un campo (despachador y monto) no es un servicio caído: no se avisa si la página tiene datos.
    const soloPermiso = new CombinedGraphQLErrors({
      errors: [{ message: 'Tu rol no tiene acceso a este dato', path: ['viaje', 'monto'], extensions: { codigo: 'SIN_PERMISO' } }],
    });
    expect(avisosServicio(soloPermiso, campos)).toEqual([]);
    expect(avisosServicio(new TypeError('Failed to fetch'), campos, true)).toEqual([
      'No se pudo hablar con el servidor. Revisa la conexión e intenta de nuevo.',
    ]);
    expect(avisosServicio(undefined, campos, true)).toEqual([]);
    // Un campo con nombre vacío lo explica su sección: ni su servicio ni "Viajes" (el padre del path) en el banner (V1-10).
    const riesgo = new CombinedGraphQLErrors({
      errors: [{ message: 'Analítica no disponible', path: ['viaje', 'riesgo'], extensions: { codigo: 'DEPENDENCIA_NO_DISPONIBLE' } }],
    });
    expect(avisosServicio(riesgo, { ...campos, riesgo: '' })).toEqual([]);
    // FB-6: en una ficha se dice qué se buscaba, y qué servicio no responde.
    expect(avisosServicio(parcial, { ...campos, unidad: { servicio: 'Flota', que: 'la unidad del viaje' } })).toEqual([
      'No se pudieron cargar la unidad del viaje: Flota no responde.',
    ]);
  });

  it('NG-1: los números van con miles en punto y decimales en coma (es-BO), nunca "1,300"', () => {
    const p = new NumeroPipe();
    expect(p.transform(1300)).toBe('1.300');
    expect(p.transform(1234567.891)).toBe('1.234.567,89');
    expect(p.transform(12.34, 1)).toBe('12,3');
    expect(p.transform(0.6, 2, 2)).toBe('0,60');
    expect(p.transform('850')).toBe('850');
    expect(p.transform(null)).toBe('Sin dato');
    expect(p.transform('abc')).toBe('abc');
  });

  it('dinero sin float: BobPipe no pasa por Number y las sumas van en centavos enteros', () => {
    // 2^53 + 1 centavos: con Number se perdería el último dígito.
    expect(new BobPipe().transform('90071992547409.93')).toBe('90.071.992.547.409,93\u00a0BOB');
    expect(new BobPipe().transform('-1250.5', false)).toBe('-1.250,50');
    expect(new BobPipe().transform('0.00')).toBe('0,00\u00a0BOB');
    expect(new BobPipe().transform('abc')).toBe('abc');
    expect(aCentavos('2800.005')).toBe(280001n); // HALF_UP al final
    expect(sumarMontos(['0.10', '0.20', null, 'x'])).toBe('0.30');
    expect(sumarMontos(['90071992547409.93', '0.01'])).toBe('90071992547409.94');
  });
});
