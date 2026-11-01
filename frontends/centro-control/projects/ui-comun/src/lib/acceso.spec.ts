import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SinAcceso } from './acceso';
import { CONFIG_CENTRO, type App, type ConfigCentro } from './configuracion';
import { Sesion } from './sesion';

const urls = {
  'cc-tablero': 'http://t',
  'cc-operaciones': 'http://o',
  'cc-flota': 'http://f',
  'cc-finanzas': 'http://fi',
  'portal-cliente': 'http://p',
};

function montar(app: App, roles: string[]) {
  TestBed.configureTestingModule({
    providers: [
      { provide: CONFIG_CENTRO, useValue: { app, urls } as unknown as ConfigCentro },
      { provide: Sesion, useValue: { roles: signal(roles), tiene: (...r: string[]) => roles.some((x) => r.includes(x)), cerrar: vi.fn() } },
    ],
  });
  const f = TestBed.createComponent(SinAcceso);
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  return {
    el,
    h1: el.querySelector('h1')?.textContent?.trim(),
    enlaces: [...el.querySelectorAll('.apps a')].map((a) => [a.textContent?.trim(), a.getAttribute('href')]),
  };
}

describe('/sin-acceso (R1F-4, R2F-6)', () => {
  it('jefe de flota en Operaciones: la app no es suya, con el ícono de sin permiso y sus apps', () => {
    const { el, h1, enlaces } = montar('cc-operaciones', ['jefe_flota']);
    expect(el.querySelector('mat-icon')?.textContent).toBe('lock_person');
    expect(h1).toBe('Tu rol no abre esta app');
    expect(enlaces).toEqual([
      ['Tablero', 'http://t'],
      ['Flota', 'http://f'],
    ]);
  });

  it('comercial en Reportes del Tablero: la app sí, la página no', () => {
    expect(montar('cc-tablero', ['comercial']).h1).toBe('Tu rol no abre esta página');
  });

  it('un cliente va al portal; sin roles, la cuenta no tiene acceso', () => {
    expect(montar('cc-tablero', ['cliente']).el.querySelector('a')?.getAttribute('href')).toBe('http://p');
    TestBed.resetTestingModule();
    expect(montar('cc-tablero', []).h1).toBe('Tu cuenta no tiene acceso');
  });
});
