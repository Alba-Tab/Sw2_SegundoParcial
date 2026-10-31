import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Sesion } from 'ui-comun';
import { Seccion } from './seccion';

function pestanas(roles: string[]): string[] {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: Sesion, useValue: { tiene: (...r: string[]) => roles.some((x) => r.includes(x)) } }],
  });
  return TestBed.runInInjectionContext(() => new Seccion()).enlaces.map((e) => e.titulo);
}

describe('pestañas de cc-operaciones por rol', () => {
  it('comercial no ve "Acciones del agente" (accionesPropuestas: gerente y despachador)', () => {
    expect(pestanas(['comercial'])).not.toContain('Acciones del agente');
    expect(pestanas(['comercial'])).toContain('Servicios');
  });

  it('despachador y gerente sí', () => {
    expect(pestanas(['despachador'])).toContain('Acciones del agente');
    expect(pestanas(['gerente'])).toContain('Acciones del agente');
  });
});
