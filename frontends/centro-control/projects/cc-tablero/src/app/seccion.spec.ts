import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Sesion } from 'ui-comun';
import { Seccion } from './seccion';

function pestanas(roles: string[]): string[] {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: Sesion, useValue: { roles: signal(roles) } }] });
  return TestBed.runInInjectionContext(() => new Seccion()).enlaces.map((e) => e.titulo);
}

describe('pestañas de cc-tablero por rol (N2)', () => {
  it('el gerente ve las cuatro', () => {
    expect(pestanas(['gerente'])).toEqual(['Tablero', 'Reportes', 'Pregunta por voz', 'Agente']);
  });

  it('el jefe de flota no tiene el agente', () => {
    expect(pestanas(['jefe_flota'])).toEqual(['Tablero', 'Reportes', 'Pregunta por voz']);
  });

  it('comercial solo tiene el tablero', () => {
    expect(pestanas(['comercial'])).toEqual(['Tablero']);
  });
});
