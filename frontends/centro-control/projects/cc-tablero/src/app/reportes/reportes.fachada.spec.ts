import { TestBed } from '@angular/core/testing';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { of, throwError, type Observable } from 'rxjs';
import { Sesion } from 'ui-comun';
import { ReportesRepositorio } from './data/reportes.repositorio';
import { ReportesFachada } from './reportes.fachada';

function fachada(catalogo: Observable<unknown>, roles: string[] = ['gerente'], pedidos: boolean[] = []) {
  TestBed.configureTestingModule({
    providers: [
      ReportesFachada,
      { provide: Sesion, useValue: { roles: () => roles } },
      {
        provide: ReportesRepositorio,
        useValue: {
          catalogo: (verClientes: boolean) => {
            pedidos.push(verClientes);
            return catalogo;
          },
        },
      },
    ],
  });
  return TestBed.inject(ReportesFachada);
}

describe('ReportesFachada: el catálogo no se traga el error', () => {
  it('con Analítica caída expone el error junto con lo que llegó', () => {
    const error = new CombinedGraphQLErrors({
      errors: [{ message: 'Analítica no responde', path: ['catalogoReportes'], extensions: { codigo: 'DEPENDENCIA_NO_DISPONIBLE' } }],
    });
    const f = fachada(of({ data: { catalogoReportes: null, clientes: [], rutas: [] }, error }));
    expect(f.errorCatalogo()).toBe(error);
    expect(f.catalogo()?.catalogoReportes).toBeNull();
    expect(f.cargandoCatalogo()).toBe(false);
  });

  it('un error que sale del observable (red) también queda expuesto, sin romper la página', () => {
    const red = new TypeError('Failed to fetch');
    const f = fachada(throwError(() => red));
    expect(f.errorCatalogo()).toBe(red);
    expect(f.catalogo()).toBeUndefined();
  });

  it('a jefe_flota no le pide clientes (Viajes no se los lista)', () => {
    const pedidos: boolean[] = [];
    fachada(of({ data: { catalogoReportes: [], rutas: [] } }), ['jefe_flota'], pedidos);
    expect(pedidos).toEqual([false]);
  });
});
