import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
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

describe('FL-3: pestañas agrupadas', () => {
  it('seis pestañas como máximo; el mapa y las colas de decisión van dentro de Viajes y Decisiones', () => {
    expect(pestanas(['gerente'])).toEqual(['Viajes', 'Decisiones', 'Servicios', 'Clientes', 'Rutas', 'Acciones del agente']);
  });

  it('las rutas viejas llevan a las nuevas y conservan los parámetros; /viajes/{id} y /acciones/{id} no cambian', async () => {
    @Component({ template: '' })
    class Vacia {}
    const hoja = (path: string) => ({ path, component: Vacia });
    TestBed.resetTestingModule();
    const { rutas } = await import('./app.routes');
    // Las mismas rutas, sin guardas ni carga perezosa: se prueba solo el ruteo.
    const hijos = rutas.find((r) => r.path === '')!.children!.map((r) => (r.redirectTo ? r : hoja(r.path!)));
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '', children: hijos }])] });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/mapa?viaje=v1');
    expect(router.url).toBe('/viajes/mapa?viaje=v1');
    await router.navigateByUrl('/entregas-observadas?q=abc');
    expect(router.url).toBe('/decisiones/entregas-observadas?q=abc');
    await router.navigateByUrl('/intervenciones');
    expect(router.url).toBe('/decisiones/intervenciones');
    await router.navigateByUrl('/decisiones');
    expect(router.url).toBe('/decisiones/entregas-observadas');
    await router.navigateByUrl('/viajes/3f2a');
    expect(router.url).toBe('/viajes/3f2a');
    await router.navigateByUrl('/acciones/a1');
    expect(router.url).toBe('/acciones/a1');
  });
});
