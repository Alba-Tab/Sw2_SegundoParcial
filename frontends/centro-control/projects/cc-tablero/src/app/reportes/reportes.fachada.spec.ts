import { TestBed } from '@angular/core/testing';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { of, throwError, type Observable } from 'rxjs';
import { ReportesRepositorio } from './data/reportes.repositorio';
import { ReportesFachada } from './reportes.fachada';

function fachada(catalogo: Observable<unknown>) {
  TestBed.configureTestingModule({
    providers: [ReportesFachada, { provide: ReportesRepositorio, useValue: { catalogo: () => catalogo } }],
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
});
