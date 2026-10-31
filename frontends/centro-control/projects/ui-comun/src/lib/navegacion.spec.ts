import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { conDesde, migaPadre, urlAdminKeycloak } from 'ui-comun/dominio';
import { Alertas } from './alertas';
import { appOrigen, CONFIG_CENTRO, type ConfigCentro } from './configuracion';
import { Encabezado } from './encabezado';
import { sinErroresDe } from './errores';
import { Marco } from './marco';
import { NoEncontrada } from './no-encontrada';
import { Sesion } from './sesion';

const urls = {
  'cc-tablero': 'http://t',
  'cc-operaciones': 'http://o',
  'cc-flota': 'http://f',
  'cc-finanzas': 'http://fi',
  'portal-cliente': 'http://p',
};
const config = { app: 'cc-flota', oidcIssuer: 'http://kc:8080/realms/transporte', urls } as unknown as ConfigCentro;

describe('navegación: lo puro', () => {
  it('"volver" lleva a la última miga con ruta antes de la actual', () => {
    expect(migaPadre([{ texto: 'Unidades', ruta: '/unidades' }, { texto: 'ABC-123' }])).toEqual({ texto: 'Unidades', ruta: '/unidades' });
    expect(migaPadre([{ texto: 'Unidades' }])).toBeUndefined();
    expect(migaPadre([])).toBeUndefined();
  });

  it('la consola de Keycloak sale del issuer (G8)', () => {
    expect(urlAdminKeycloak('http://kc:8080/realms/transporte')).toBe('http://kc:8080/admin/transporte/console/');
    expect(urlAdminKeycloak('https://auth.ejemplo.bo/kc/realms/transporte/')).toBe('https://auth.ejemplo.bo/kc/admin/transporte/console/');
    expect(urlAdminKeycloak('http://kc:8080/')).toBeUndefined();
  });

  it('conDesde agrega el parámetro con ? o &', () => {
    expect(conDesde('http://o/viajes/1', 'cc-tablero')).toBe('http://o/viajes/1?desde=cc-tablero');
    expect(conDesde('http://o/viajes?estado=EN_RUTA', 'cc-flota')).toBe('http://o/viajes?estado=EN_RUTA&desde=cc-flota');
  });

  it('appOrigen solo acepta otra app del Centro de Control', () => {
    expect(appOrigen('cc-tablero', 'cc-flota')).toBe('cc-tablero');
    expect(appOrigen('cc-flota', 'cc-flota')).toBeUndefined();
    expect(appOrigen('portal-cliente', 'cc-flota')).toBeUndefined();
    expect(appOrigen('toString', 'cc-flota')).toBeUndefined();
    expect(appOrigen(null, 'cc-flota')).toBeUndefined();
  });

  it('sinErroresDe quita solo los errores de ese campo (W3)', () => {
    const riesgo = { message: 'Analítica', path: ['viaje', 'riesgo'], extensions: { codigo: 'DEPENDENCIA_NO_DISPONIBLE' } };
    const unidad = { message: 'Flota', path: ['viaje', 'unidad'], extensions: { codigo: 'DEPENDENCIA_NO_DISPONIBLE' } };
    expect(sinErroresDe(new CombinedGraphQLErrors({ errors: [riesgo] }), 'riesgo')).toBeUndefined();
    const resto = sinErroresDe(new CombinedGraphQLErrors({ errors: [riesgo, unidad] }), 'riesgo');
    expect(CombinedGraphQLErrors.is(resto) && resto.errors.map((e) => e.message)).toEqual(['Flota']);
    const red = new Error('red');
    expect(sinErroresDe(red, 'riesgo')).toBe(red);
  });
});

describe('navegación: componentes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'unidades', component: NoEncontrada },
          { path: '**', component: NoEncontrada },
        ]),
        { provide: CONFIG_CENTRO, useValue: config },
      ],
    });
  });

  async function encabezado(url: string) {
    await RouterTestingHarness.create(url); // navega para que el encabezado lea la consulta
    const f = TestBed.createComponent(Encabezado);
    f.componentRef.setInput('titulo', 'ABC-123');
    f.componentRef.setInput('migas', [{ texto: 'Unidades', ruta: '/unidades' }, { texto: 'ABC-123' }]);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('el encabezado de un detalle tiene migas con la actual marcada, volver a la lista y el h1', async () => {
    const el = await encabezado('/unidades');
    const migas = el.querySelector('nav[aria-label="Migas de pan"]')!;
    expect(migas.querySelector('a')?.getAttribute('href')).toBe('/unidades');
    expect(migas.querySelector('[aria-current="page"]')?.textContent).toBe('ABC-123');
    expect(el.querySelector('a[aria-label="Volver a Unidades"]')?.getAttribute('href')).toBe('/unidades');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('ABC-123');
    expect(el.textContent).not.toContain('Volver a Tablero');
  });

  it('con ?desde=<otra app> ofrece volver a ella (N5)', async () => {
    const el = await encabezado('/unidades?desde=cc-tablero');
    const origen = [...el.querySelectorAll('a')].find((a) => a.textContent?.includes('Volver a Tablero'));
    expect(origen?.getAttribute('href')).toBe('http://t');
  });

  it('una ruta desconocida muestra la página 404 con enlace al inicio (N4)', async () => {
    const h = await RouterTestingHarness.create('/no/existe');
    const el = h.routeNativeElement!;
    expect(el.querySelector('h1')?.textContent).toBe('No encontramos esta página');
    const inicio = el.querySelector('a');
    expect(inicio?.getAttribute('href')).toBe('/');
    expect(inicio?.textContent).toContain('Flota');
    expect(TestBed.inject(Router).url).toBe('/no/existe');
  });
});

describe('barra común', () => {
  function marco(roles: string[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ estado: 'UP' }) })),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CONFIG_CENTRO, useValue: config },
        {
          provide: Sesion,
          useValue: {
            roles: signal(roles),
            rolesInternos: signal(roles),
            nombre: signal('Ana'),
            tiene: (...r: string[]) => roles.some((x) => r.includes(x)),
          },
        },
        {
          provide: Alertas,
          useValue: {
            iniciar: vi.fn(async () => undefined),
            abiertas: signal(0),
            disponible: signal(true),
            lista: signal([]),
            errorAtencion: signal(null),
          },
        },
      ],
    });
    const f = TestBed.createComponent(Marco);
    f.detectChanges();
    return f;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('la marca enlaza al inicio de la app y la actual lleva aria-current', () => {
    const el = marco(['jefe_flota']).nativeElement as HTMLElement;
    expect(el.querySelector('a.marca')?.getAttribute('href')).toBe('/');
    expect(el.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Flota');
  });

  it('solo el gerente tiene "Administrar usuarios" hacia la consola de Keycloak, en otra pestaña', () => {
    expect(marco(['gerente']).componentInstance.adminUsuarios()).toBe('http://kc:8080/admin/transporte/console/');
    TestBed.resetTestingModule();
    expect(marco(['jefe_flota']).componentInstance.adminUsuarios()).toBeUndefined();
  });
});
